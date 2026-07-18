import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type AgentActivityState,
    type ChatPinSummary,
    type ChatSummary,
    type MessageSummary,
    type PresenceSnapshot,
    type TypingState,
    type UserError,
} from "../../types.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

function sorted(messages: ChatMessageItem[]): readonly ChatMessageItem[] {
    return messages.sort(messageItemCompare);
}

function sameIds(
    left: readonly { readonly expiresAt: number }[],
    right: readonly { readonly expiresAt: number }[],
): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export interface ChatLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStore | undefined;
}

/** Loads one already materialized chat without creating a store for an absent consumer. */
export async function chatLoad(context: ChatLoadContext, chatId: string): Promise<void> {
    const binding = context.chatGet(chatId);
    if (!binding || !context.runtime.connected) return;
    binding.getState().chatInput({ type: "chatLoading" });
    try {
        const [chatResult, messagesResult] = await Promise.all([
            context.runtime.operation("getChat", { chatId }),
            context.runtime.operation("getMessages", { chatId, limit: 100 }),
        ]);
        const current = context.chatGet(chatId);
        if (!current || !context.runtime.active) return;
        current.getState().chatInput({
            type: "chatLoaded",
            chat: chatResult.chat,
            messages: messagesResult.messages.map((message) =>
                messageItemProject(context.identities, message),
            ),
            hasMoreMessages: messagesResult.hasMore,
        });
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "chatFailed", error: userError(error) });
    }
}

export interface ChatMembersLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStore | undefined;
    presenceGet(userId: string): PresenceSnapshot | undefined;
}

/** Loads members only for a retained member panel on an existing chat surface. */
export async function chatMembersLoad(
    context: ChatMembersLoadContext,
    chatId: string,
): Promise<void> {
    if (!context.chatGet(chatId) || !context.runtime.connected) return;
    try {
        const result = await context.runtime.operation("getChatMembers", { chatId });
        const chat = context.chatGet(chatId)?.getState().status;
        const ownerUserId = chat?.type === "ready" ? chat.value.ownerUserId : undefined;
        const members = result.users.map((user): ChatMemberProjection => {
            const identity = context.identities.project(user);
            return {
                ...identity,
                role:
                    user.id === ownerUserId ? "owner" : user.role === "admin" ? "admin" : "member",
                ...(user.systemRole ? { systemRole: user.systemRole } : {}),
                ...(user.title ? { title: user.title } : {}),
                presence: context.presenceGet(user.id)?.status ?? "offline",
            };
        });
        context.chatGet(chatId)?.getState().chatInput({ type: "membersLoaded", members });
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "membersFailed", error: userError(error) });
    }
}

export interface ChatOpenContext {
    chatAcquire(chatId: string): ChatStore;
    chatRelease(chatId: string): void;
    chatLoad(chatId: string): void;
}

/** Acquires one keyed chat surface and starts loading only when its payload is still unloaded. */
export function chatOpen(context: ChatOpenContext, chatId: string): ChatHandle {
    const binding = context.chatAcquire(chatId);
    if (binding.getState().status.type === "unloaded") context.chatLoad(chatId);
    let released = false;
    return {
        ...binding,
        [Symbol.dispose]: () => {
            if (released) return;
            released = true;
            context.chatRelease(chatId);
        },
    };
}

/** Loads render-ready pinned messages only after the retained chat surface requests them. */
export async function chatPinsLoad(context: ChatLoadContext, chatId: string): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat || !context.runtime.connected) return;
    chat.getState().chatInput({ type: "pinsLoading" });
    try {
        const result = await context.runtime.operation("getChatPins", { chatId });
        const current = context.chatGet(chatId);
        if (!current) return;
        current.getState().chatInput({
            type: "pinsLoaded",
            pins: result.pins.map((pin) => ({
                ...pin,
                message: messageProject(context.identities, pin.message),
            })),
        });
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "pinsFailed", error: userError(error) });
    }
}

/** Creates one on-demand conversation surface with state and mutations in one Zustand object. */
export function chatStoreCreate(
    chatId: string,
    output: (event: ChatOutput) => void = () => undefined,
): ChatStore {
    return createStore<ChatState>()((set, get) => ({
        chatId,
        status: { type: "unloaded" },
        messages: [],
        hasMoreMessages: false,
        members: { type: "unloaded" },
        pins: { type: "unloaded" },
        reactionActors: {},
        typing: [],
        agentActivity: [],
        agentEffort: {},

        membersRetain(): void {
            const current = get().members;
            if (current.type === "loading" || current.type === "ready") return;
            get().chatInput({ type: "membersLoading" });
            output({ type: "membersRetained", chatId });
        },
        pinsRetain(): void {
            const current = get().pins;
            if (current.type === "loading" || current.type === "ready") return;
            get().chatInput({ type: "pinsLoading" });
            output({ type: "pinsRetained", chatId });
        },
        reactionActorsRetain(messageId, reactionKey): void {
            const key = reactionActorsKey(messageId, reactionKey);
            const current = get().reactionActors[key];
            if (current?.type === "loading" || current?.type === "ready") return;
            get().chatInput({ type: "reactionActorsLoading", messageId, reactionKey });
            output({ type: "reactionActorsRetained", chatId, messageId, reactionKey });
        },
        agentEffortRetain(agentUserId): void {
            const current = get().agentEffort[agentUserId];
            if (current?.type === "loading" || current?.type === "ready") return;
            get().chatInput({ type: "agentEffortLoading", agentUserId });
            output({ type: "agentEffortRetained", chatId, agentUserId });
        },
        agentEffortChange(agentUserId, effort): void {
            output({ type: "agentEffortSubmitted", chatId, agentUserId, effort });
        },
        chatInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "chatLoading":
                        return snapshot.status.type === "loading"
                            ? snapshot
                            : { ...snapshot, status: { type: "loading" } };
                    case "chatLoaded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.chat },
                            messages: messageItemsMerge(snapshot.messages, event.messages),
                            hasMoreMessages: event.hasMoreMessages,
                        };
                    case "chatFailed":
                        return { ...snapshot, status: { type: "error", error: event.error } };
                    case "chatSummaryReconciled":
                        return snapshot.status.type === "ready" &&
                            snapshot.status.value === event.chat
                            ? snapshot
                            : { ...snapshot, status: { type: "ready", value: event.chat } };
                    case "messageUpserted": {
                        const index = snapshot.messages.findIndex(
                            (item) =>
                                item.message.id === event.item.message.id ||
                                (event.item.clientMutationId !== undefined &&
                                    item.clientMutationId === event.item.clientMutationId),
                        );
                        if (index < 0)
                            return {
                                ...snapshot,
                                messages: sorted([...snapshot.messages, event.item]),
                            };
                        if (
                            snapshot.messages[index] === event.item ||
                            messageItemEquivalent(snapshot.messages[index]!, event.item)
                        )
                            return snapshot;
                        const messages = [...snapshot.messages];
                        messages[index] = event.item;
                        return { ...snapshot, messages: sorted(messages) };
                    }
                    case "messageRemoved": {
                        const messages = snapshot.messages.filter(
                            (item) => item.message.id !== event.messageId,
                        );
                        return messages.length === snapshot.messages.length
                            ? snapshot
                            : { ...snapshot, messages };
                    }
                    case "membersLoading":
                        return snapshot.members.type === "loading"
                            ? snapshot
                            : { ...snapshot, members: { type: "loading" } };
                    case "membersLoaded":
                        return { ...snapshot, members: { type: "ready", value: event.members } };
                    case "membersFailed":
                        return { ...snapshot, members: { type: "error", error: event.error } };
                    case "pinsLoading":
                        return snapshot.pins.type === "loading"
                            ? snapshot
                            : { ...snapshot, pins: { type: "loading" } };
                    case "pinsLoaded":
                        return { ...snapshot, pins: { type: "ready", value: event.pins } };
                    case "pinsFailed":
                        return { ...snapshot, pins: { type: "error", error: event.error } };
                    case "reactionActorsLoading": {
                        const key = reactionActorsKey(event.messageId, event.reactionKey);
                        if (snapshot.reactionActors[key]?.type === "loading") return snapshot;
                        return {
                            ...snapshot,
                            reactionActors: {
                                ...snapshot.reactionActors,
                                [key]: { type: "loading" },
                            },
                        };
                    }
                    case "reactionActorsLoaded": {
                        const key = reactionActorsKey(
                            event.details.messageId,
                            event.details.reactionKey,
                        );
                        return {
                            ...snapshot,
                            reactionActors: {
                                ...snapshot.reactionActors,
                                [key]: { type: "ready", value: event.details },
                            },
                        };
                    }
                    case "reactionActorsFailed": {
                        const key = reactionActorsKey(event.messageId, event.reactionKey);
                        return {
                            ...snapshot,
                            reactionActors: {
                                ...snapshot.reactionActors,
                                [key]: { type: "error", error: event.error },
                            },
                        };
                    }
                    case "typingReconciled":
                        return sameIds(snapshot.typing, event.typing)
                            ? snapshot
                            : { ...snapshot, typing: event.typing };
                    case "agentActivityReconciled":
                        return sameIds(snapshot.agentActivity, event.agentActivity)
                            ? snapshot
                            : { ...snapshot, agentActivity: event.agentActivity };
                    case "identityReconciled": {
                        let changed = false;
                        const messages = snapshot.messages.map((item) => {
                            if (
                                item.message.sender?.id !== event.identity.id ||
                                item.message.sender === event.identity
                            )
                                return item;
                            changed = true;
                            return {
                                ...item,
                                message: { ...item.message, sender: event.identity },
                            };
                        });
                        const members =
                            snapshot.members.type === "ready"
                                ? snapshot.members.value.map((member) => {
                                      if (member.id !== event.identity.id) return member;
                                      changed = true;
                                      return { ...member, ...event.identity };
                                  })
                                : undefined;
                        const pins =
                            snapshot.pins.type === "ready"
                                ? snapshot.pins.value.map((pin) => {
                                      if (
                                          pin.message.sender?.id !== event.identity.id ||
                                          pin.message.sender === event.identity
                                      )
                                          return pin;
                                      changed = true;
                                      return {
                                          ...pin,
                                          message: { ...pin.message, sender: event.identity },
                                      };
                                  })
                                : undefined;
                        return changed
                            ? {
                                  ...snapshot,
                                  messages,
                                  ...(members
                                      ? { members: { type: "ready", value: members } }
                                      : {}),
                                  ...(pins ? { pins: { type: "ready", value: pins } } : {}),
                              }
                            : snapshot;
                    }
                    case "agentEffortLoading":
                        return {
                            ...snapshot,
                            agentEffort: {
                                ...snapshot.agentEffort,
                                [event.agentUserId]: { type: "loading" },
                            },
                        };
                    case "agentEffortLoaded":
                        return {
                            ...snapshot,
                            agentEffort: {
                                ...snapshot.agentEffort,
                                [event.value.agentUserId]: { type: "ready", value: event.value },
                            },
                        };
                    case "agentEffortFailed":
                        return {
                            ...snapshot,
                            agentEffort: {
                                ...snapshot.agentEffort,
                                [event.agentUserId]: { type: "error", error: event.error },
                            },
                        };
                }
            });
        },
    }));
}

export interface ChatReactionSummary {
    readonly key: string;
    readonly emoji?: string;
    readonly customEmojiId?: string;
    readonly count: number;
    readonly reacted: boolean;
}

export interface ChatMessageProjection extends Omit<MessageSummary, "sender" | "reactions"> {
    readonly sender?: IdentityProjection;
    readonly reactions: readonly ChatReactionSummary[];
}

export interface ChatMessageItem {
    readonly message: ChatMessageProjection;
    readonly source: "server" | "local";
    readonly delivery: "sending" | "sent" | "failed";
    readonly clientMutationId?: string;
    readonly error?: UserError;
}

export type Loadable<Value> =
    | { readonly type: "unloaded" }
    | { readonly type: "loading" }
    | { readonly type: "ready"; readonly value: Value }
    | { readonly type: "error"; readonly error: UserError };

export interface ChatMemberProjection extends IdentityProjection {
    readonly role: "owner" | "admin" | "member";
    readonly systemRole?: "service";
    readonly title?: string;
    readonly presence: PresenceSnapshot["status"];
}

export interface ReactionActors {
    readonly messageId: string;
    readonly reactionKey: string;
    readonly actors: readonly IdentityProjection[];
}

export interface ChatPinProjection extends Omit<ChatPinSummary, "message"> {
    readonly message: ChatMessageProjection;
}

export interface ChatSnapshot {
    readonly chatId: string;
    readonly status: Loadable<ChatSummary>;
    readonly messages: readonly ChatMessageItem[];
    readonly hasMoreMessages: boolean;
    readonly members: Loadable<readonly ChatMemberProjection[]>;
    readonly pins: Loadable<readonly ChatPinProjection[]>;
    readonly reactionActors: Readonly<Record<string, Loadable<ReactionActors>>>;
    readonly typing: readonly TypingState[];
    readonly agentActivity: readonly AgentActivityState[];
    readonly agentEffort: Readonly<Record<string, Loadable<AgentEffortProjection>>>;
}

export interface AgentEffortProjection {
    readonly agentUserId: string;
    readonly effort: string;
    readonly options: readonly string[];
}

export type ChatOutput =
    | { readonly type: "membersRetained"; readonly chatId: string }
    | { readonly type: "pinsRetained"; readonly chatId: string }
    | {
          readonly type: "reactionActorsRetained";
          readonly chatId: string;
          readonly messageId: string;
          readonly reactionKey: string;
      }
    | {
          readonly type: "agentEffortRetained";
          readonly chatId: string;
          readonly agentUserId: string;
      }
    | {
          readonly type: "agentEffortSubmitted";
          readonly chatId: string;
          readonly agentUserId: string;
          readonly effort: string;
      };

export type ChatInput =
    | { readonly type: "chatLoading" }
    | {
          readonly type: "chatLoaded";
          readonly chat: ChatSummary;
          readonly messages: readonly ChatMessageItem[];
          readonly hasMoreMessages: boolean;
      }
    | { readonly type: "chatFailed"; readonly error: UserError }
    | { readonly type: "chatSummaryReconciled"; readonly chat: ChatSummary }
    | { readonly type: "messageUpserted"; readonly item: ChatMessageItem }
    | { readonly type: "messageRemoved"; readonly messageId: string }
    | { readonly type: "membersLoading" }
    | { readonly type: "membersLoaded"; readonly members: readonly ChatMemberProjection[] }
    | { readonly type: "membersFailed"; readonly error: UserError }
    | { readonly type: "pinsLoading" }
    | { readonly type: "pinsLoaded"; readonly pins: readonly ChatPinProjection[] }
    | { readonly type: "pinsFailed"; readonly error: UserError }
    | {
          readonly type: "reactionActorsLoading";
          readonly messageId: string;
          readonly reactionKey: string;
      }
    | { readonly type: "reactionActorsLoaded"; readonly details: ReactionActors }
    | {
          readonly type: "reactionActorsFailed";
          readonly messageId: string;
          readonly reactionKey: string;
          readonly error: UserError;
      }
    | { readonly type: "typingReconciled"; readonly typing: readonly TypingState[] }
    | {
          readonly type: "agentActivityReconciled";
          readonly agentActivity: readonly AgentActivityState[];
      }
    | { readonly type: "identityReconciled"; readonly identity: IdentityProjection }
    | { readonly type: "agentEffortLoading"; readonly agentUserId: string }
    | { readonly type: "agentEffortLoaded"; readonly value: AgentEffortProjection }
    | {
          readonly type: "agentEffortFailed";
          readonly agentUserId: string;
          readonly error: UserError;
      };

export interface ChatState extends ChatSnapshot {
    membersRetain(): void;
    pinsRetain(): void;
    reactionActorsRetain(messageId: string, reactionKey: string): void;
    agentEffortRetain(agentUserId: string): void;
    agentEffortChange(agentUserId: string, effort: string): void;
    chatInput(event: ChatInput): void;
}

export type ChatStore = StoreApi<ChatState>;

export interface ChatHandle extends ChatStore, Disposable {}

export function reactionActorsKey(messageId: string, reactionKey: string): string {
    return `${messageId}\u0000${reactionKey}`;
}

/** Converts one server message into a render projection without presence or reaction actor payloads. */
export function messageProject(
    identities: IdentityCatalog,
    message: MessageSummary,
): ChatMessageProjection {
    const { sender, reactions, ...visible } = message;
    return {
        ...visible,
        ...(sender ? { sender: identities.project(sender) } : {}),
        reactions: reactions.map(({ userIds: _userIds, ...reaction }) => reaction),
    };
}

export function messageItemProject(
    identities: IdentityCatalog,
    message: MessageSummary,
): ChatMessageItem {
    return { message: messageProject(identities, message), source: "server", delivery: "sent" };
}

export function messageItemsMerge(
    current: readonly ChatMessageItem[],
    incoming: readonly ChatMessageItem[],
): readonly ChatMessageItem[] {
    const existingById = new Map(current.map((item) => [item.message.id, item]));
    const existingByMutation = new Map(
        current
            .filter((item) => item.clientMutationId !== undefined)
            .map((item) => [item.clientMutationId!, item]),
    );
    const consumed = new Set<ChatMessageItem>();
    const next = incoming.map((item) => {
        const previous =
            existingById.get(item.message.id) ??
            (item.clientMutationId ? existingByMutation.get(item.clientMutationId) : undefined);
        if (previous) consumed.add(previous);
        if (previous && messageItemEquivalent(previous, item)) {
            return previous;
        }
        return item;
    });
    for (const item of current) {
        if (!consumed.has(item) && item.delivery !== "sent") next.push(item);
    }
    next.sort(messageItemCompare);
    return sameReferences(current, next) ? current : next;
}

export function messageItemEquivalent(left: ChatMessageItem, right: ChatMessageItem): boolean {
    if (
        left.delivery !== right.delivery ||
        left.source !== right.source ||
        left.clientMutationId !== right.clientMutationId ||
        left.error !== right.error
    )
        return false;
    if (left.message === right.message) return true;
    if (left.source !== "server") return false;
    return (
        left.message.id === right.message.id &&
        left.message.changePts === right.message.changePts &&
        left.message.revision === right.message.revision &&
        left.message.deletedAt === right.message.deletedAt &&
        left.message.text === right.message.text &&
        left.message.generationStatus === right.message.generationStatus &&
        left.message.sender === right.message.sender &&
        reactionsEqual(left.message.reactions, right.message.reactions)
    );
}

export function messageItemCompare(left: ChatMessageItem, right: ChatMessageItem): number {
    const leftLocal = left.source === "local";
    const rightLocal = right.source === "local";
    if (leftLocal !== rightLocal) return leftLocal ? 1 : -1;
    if (leftLocal) return left.message.createdAt.localeCompare(right.message.createdAt);
    try {
        const difference = BigInt(left.message.sequence) - BigInt(right.message.sequence);
        return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    } catch {
        return left.message.sequence.localeCompare(right.message.sequence);
    }
}

function reactionsEqual(
    left: readonly import("./chatState.js").ChatReactionSummary[],
    right: readonly import("./chatState.js").ChatReactionSummary[],
): boolean {
    return (
        left.length === right.length &&
        left.every(
            (reaction, index) =>
                reaction.key === right[index]?.key &&
                reaction.count === right[index]?.count &&
                reaction.reacted === right[index]?.reacted,
        )
    );
}

function sameReferences(
    left: readonly ChatMessageItem[],
    right: readonly ChatMessageItem[],
): boolean {
    return left.length === right.length && left.every((item, index) => item === right[index]);
}

export interface ReactionActorsLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStore | undefined;
}

/** Loads reaction actors only after a retained hover/details request on an existing chat. */
export async function reactionActorsLoad(
    context: ReactionActorsLoadContext,
    chatId: string,
    messageId: string,
    reactionKey: string,
): Promise<void> {
    if (!context.chatGet(chatId) || !context.runtime.connected) return;
    try {
        const [messageResult, membersResult] = await Promise.all([
            context.runtime.operation("getMessage", { messageId }),
            context.runtime.operation("getChatMembers", { chatId }),
        ]);
        const reaction = messageResult.message.reactions.find((item) => item.key === reactionKey);
        const actorIds = new Set(reaction?.userIds ?? []);
        const actors = membersResult.users
            .filter((user) => actorIds.has(user.id))
            .map((user) => context.identities.project(user));
        context.chatGet(chatId)?.getState().chatInput({
            type: "reactionActorsLoaded",
            details: { messageId, reactionKey, actors },
        });
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({
                type: "reactionActorsFailed",
                messageId,
                reactionKey,
                error: userError(error),
            });
    }
}
