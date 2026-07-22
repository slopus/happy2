import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type DocumentWriteRequestSummary,
    type PluginManagementRequestSummary,
    type PortShareSummary,
} from "../../resources.js";
import {
    type AgentActivityState,
    type ChatPinSummary,
    type ChatSummary,
    type MessageSummary,
    type PresenceSnapshot,
    type TypingState,
    UserError,
} from "../../types.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type ComposerStore } from "../composer/composerState.js";
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
    /** Returns agents already known for this chat without materializing another surface. */
    agentUserIds?(chat: ChatSummary): readonly string[];
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
        for (const agentUserId of new Set(context.agentUserIds?.(chatResult.chat) ?? []))
            current.getState().agentEffortRetain(agentUserId);
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
    composerGet(chatId: string): ComposerStore | undefined;
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
                ...(user.title ? { title: user.title } : {}),
                presence: context.presenceGet(user.id)?.status ?? "offline",
            };
        });
        context.chatGet(chatId)?.getState().chatInput({ type: "membersLoaded", members });
        context
            .composerGet(chatId)
            ?.getState()
            .composerInput({
                type: "agentUsersReconciled",
                agentUserIds: result.users
                    .filter((user) => user.kind === "agent")
                    .map((user) => user.id),
            });
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

/**
 * Ordering guard for plugin request reads, keyed by the materialized store so
 * a store's disposal naturally invalidates its in-flight reads. Every read
 * takes a new generation; only the newest may land, and a direct decision
 * result bumps the generation so an older pending list can never regress a
 * request the server already resolved.
 */
const pluginRequestGenerations = new WeakMap<ChatStore, number>();

function pluginRequestGenerationNext(chat: ChatStore): number {
    const generation = (pluginRequestGenerations.get(chat) ?? 0) + 1;
    pluginRequestGenerations.set(chat, generation);
    return generation;
}

/** Loads render-ready plugin management requests only after the retained chat surface requests them. */
export async function chatPluginRequestsLoad(
    context: ChatLoadContext,
    chatId: string,
): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat || !context.runtime.connected) return;
    const generation = pluginRequestGenerationNext(chat);
    const current = (): ChatStore | undefined => {
        const binding = context.chatGet(chatId);
        return binding === chat && pluginRequestGenerations.get(chat) === generation
            ? binding
            : undefined;
    };
    try {
        const result = await context.runtime.operation("getPluginManagementRequests", { chatId });
        current()
            ?.getState()
            .chatInput({ type: "pluginRequestsLoaded", requests: result.requests });
    } catch (error) {
        current()
            ?.getState()
            .chatInput({ type: "pluginRequestsFailed", error: userError(error) });
    }
}

export interface ChatPluginRequestDecideContext {
    readonly runtime: StateRuntime;
    chatGet(chatId: string): ChatStore | undefined;
    /** Reconciles the admin plugin surface after a decision durably changes installations. */
    pluginsReconcile(): void;
}

const documentWriteRequestGenerations = new WeakMap<ChatStore, number>();

function documentWriteRequestGenerationNext(chat: ChatStore): number {
    const next = (documentWriteRequestGenerations.get(chat) ?? 0) + 1;
    documentWriteRequestGenerations.set(chat, next);
    return next;
}

/**
 * Loads the retained document-write approval requests for one chat through the
 * durable listing, so approval cards reflect the server's request lifecycle
 * rather than any realtime payload. Stale overlapping reads are discarded by
 * generation, and a surface released mid-read never receives the result.
 */
export async function chatDocumentWriteRequestsLoad(
    context: ChatLoadContext,
    chatId: string,
): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat || !context.runtime.connected) return;
    const generation = documentWriteRequestGenerationNext(chat);
    const current = (): ChatStore | undefined => {
        const binding = context.chatGet(chatId);
        return binding === chat && documentWriteRequestGenerations.get(chat) === generation
            ? binding
            : undefined;
    };
    try {
        const result = await context.runtime.operation("getDocumentWriteRequests", { chatId });
        current()
            ?.getState()
            .chatInput({ type: "documentWriteRequestsLoaded", requests: result.requests });
    } catch (error) {
        current()
            ?.getState()
            .chatInput({ type: "documentWriteRequestsFailed", error: userError(error) });
    }
}

export interface ChatDocumentWriteRequestDecideContext {
    readonly runtime: StateRuntime;
    chatGet(chatId: string): ChatStore | undefined;
}

/**
 * Performs one member approve/deny decision on an agent's staged document
 * write and applies the terminal request summary authoritatively to the
 * retained chat surface. An approval durably applies the staged Yjs updates,
 * so open document sessions converge through the normal document.updated flow.
 */
export async function chatDocumentWriteRequestDecide(
    context: ChatDocumentWriteRequestDecideContext,
    event: Extract<ChatOutput, { type: "documentWriteRequestDecisionSubmitted" }>,
): Promise<void> {
    const operation =
        event.decision === "approve"
            ? ("approveDocumentWrite" as const)
            : ("denyDocumentWrite" as const);
    try {
        const result = await context.runtime.operation(operation, {
            chatId: event.chatId,
            requestId: event.requestId,
        });
        const chat = context.chatGet(event.chatId);
        if (chat) {
            documentWriteRequestGenerationNext(chat);
            chat.getState().chatInput({
                type: "documentWriteRequestReconciled",
                request: result.request,
            });
        }
    } catch (error) {
        context
            .chatGet(event.chatId)
            ?.getState()
            .chatInput({
                type: "documentWriteRequestDecisionFailed",
                requestId: event.requestId,
                error: userError(error),
            });
    }
}

/**
 * Performs one chat-scoped approve/deny decision against the exact request and applies the
 * terminal approval summary authoritatively to the retained chat surface. An approval durably
 * installs or uninstalls the plugin, so the admin plugin surface reconciles afterwards.
 */
export async function chatPluginRequestDecide(
    context: ChatPluginRequestDecideContext,
    event: Extract<ChatOutput, { type: "pluginRequestDecisionSubmitted" }>,
): Promise<void> {
    const operation =
        event.action === "install"
            ? event.decision === "approve"
                ? ("approvePluginInstall" as const)
                : ("denyPluginInstall" as const)
            : event.decision === "approve"
              ? ("approvePluginUninstall" as const)
              : ("denyPluginUninstall" as const);
    try {
        const result = await context.runtime.operation(operation, {
            chatId: event.chatId,
            requestId: event.requestId,
        });
        const chat = context.chatGet(event.chatId);
        if (chat) {
            // A list read started before this decision may still be in flight
            // with the request pending; invalidate it so the older read cannot
            // land after this authoritative terminal result.
            pluginRequestGenerationNext(chat);
            chat.getState().chatInput({
                type: "pluginRequestReconciled",
                request: result.approval,
            });
        }
        if (event.decision === "approve") context.pluginsReconcile();
    } catch (error) {
        context
            .chatGet(event.chatId)
            ?.getState()
            .chatInput({
                type: "pluginRequestDecisionFailed",
                requestId: event.requestId,
                error: userError(error),
            });
    }
}

/**
 * Reserved external browser target for one port-share open. `reserve()` runs
 * synchronously inside the originating click so the browser attributes the
 * window to the user gesture; the resolved wildcard URL and its short-lived
 * bearer token are handed to `navigate` afterwards and never surface to product
 * snapshot code. `null` means the environment refused the window (blocked
 * pop-up), which the surface reports as a displayable failure.
 */
export interface PortShareAccessTarget {
    /** Exchanges the bearer token for the host-only cookie, then points the reserved window at the share. */
    navigate(url: string, token: string): Promise<void>;
    /**
     * Re-runs only the bearer→cookie exchange in the originating window's cookie
     * jar, refreshing the host cookie for the already-open external tab without
     * navigating it again. Used by the refresh lease at each `refreshAfter`.
     */
    exchange(url: string, token: string): Promise<void>;
    /** True once the reserved/opened external window has been closed, so the lease can stop. */
    readonly closed: boolean;
    /** Abandons the reserved window after a failure so no blank tab is left behind. */
    release(): void;
}

export interface PortShareAccess {
    reserve(): PortShareAccessTarget | null;
}

/**
 * Ordering guard for port-share list reads, keyed by the materialized store so a
 * store's disposal invalidates its in-flight reads. Only the newest read may land.
 */
const portShareGenerations = new WeakMap<ChatStore, number>();

function portShareGenerationNext(chat: ChatStore): number {
    const generation = (portShareGenerations.get(chat) ?? 0) + 1;
    portShareGenerations.set(chat, generation);
    return generation;
}

/** Loads the chat's active member-visible port shares for a retained chat surface without flipping a ready list back to loading. */
export async function chatPortSharesLoad(context: ChatLoadContext, chatId: string): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat || !context.runtime.connected) return;
    const generation = portShareGenerationNext(chat);
    const current = (): ChatStore | undefined => {
        const binding = context.chatGet(chatId);
        return binding === chat && portShareGenerations.get(chat) === generation
            ? binding
            : undefined;
    };
    try {
        const result = await context.runtime.operation("getChatPortShares", { chatId });
        current()
            ?.getState()
            .chatInput({ type: "portSharesLoaded", portShares: result.portShares });
    } catch (error) {
        current()
            ?.getState()
            .chatInput({ type: "portSharesFailed", error: userError(error) });
    }
}

export interface ChatPortShareDisableContext extends ChatLoadContext {
    /**
     * Signals that the server confirmed the disable, so the owner can stop the exact share's
     * refresh lease immediately — independent of, and before, the follow-up list read that may
     * fail without ever removing the share locally.
     */
    portShareDisabled?(chatId: string, portShareId: string): void;
}

/**
 * Disables one active port share after a chat member requested it, then reconciles the durable
 * active list so the closed share disappears from every retained chat surface. The optimistic local
 * state is only the per-share busy marker; the removal itself is never fabricated before the server
 * confirms it. The busy marker clears the instant the disable POST succeeds, before the follow-up
 * list read, so a failed reconcile read can never leave it stuck; the confirmed-disable signal fires
 * at the same authoritative point so the share's refresh lease stops immediately rather than waiting
 * for a later failed reissue. A click while disconnected settles deterministically with a displayable
 * error instead of issuing transport work or hanging the marker.
 */
export async function chatPortShareDisable(
    context: ChatPortShareDisableContext,
    chatId: string,
    portShareId: string,
): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat) return;
    if (!context.runtime.connected || !context.runtime.active) {
        chat.getState().chatInput({
            type: "portShareDisableFailed",
            portShareId,
            error: new UserError("This client is not connected to a server."),
        });
        return;
    }
    try {
        await context.runtime.operation("disablePortShare", { chatId, portShareId });
        // Clear the busy marker and stop the refresh lease on the authoritative
        // success, before the follow-up durable read, so a failed reconcile GET
        // can never strand the marker or keep a confirmed-disabled lease alive.
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "portShareDisableSettled", portShareId });
        context.portShareDisabled?.(chatId, portShareId);
        await chatPortSharesLoad(context, chatId);
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "portShareDisableFailed", portShareId, error: userError(error) });
    }
}

export interface PortShareLeaseStart {
    readonly chatId: string;
    readonly portShareId: string;
    readonly url: string;
    readonly refreshAfter: string;
    readonly target: PortShareAccessTarget;
}

export interface ChatPortShareOpenContext extends ChatLoadContext {
    readonly portShareAccess?: PortShareAccess;
    /** Begins the client-maintained refresh lease once the first exchange + navigation succeeds. */
    portShareLeaseStart?(input: PortShareLeaseStart): void;
}

/**
 * Completes one port-share open against a window reserved during the click: issues a fresh scoped
 * access token, performs the cross-origin bearer→cookie exchange, and points the reserved window at
 * the share. The token is issued and consumed entirely here so it never enters product snapshot
 * state; a blocked pop-up, revoked membership, or exchange failure clears the busy marker and
 * surfaces a displayable error on the owning chat surface.
 */
export async function chatPortShareOpen(
    context: ChatPortShareOpenContext,
    chatId: string,
    portShareId: string,
    target: PortShareAccessTarget | null,
): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat) {
        target?.release();
        return;
    }
    if (!target) {
        chat.getState().chatInput({
            type: "portShareOpenFailed",
            portShareId,
            error: new UserError("Allow pop-ups for this app to open the shared preview."),
        });
        return;
    }
    if (!context.runtime.connected) {
        target.release();
        chat.getState().chatInput({
            type: "portShareOpenFailed",
            portShareId,
            error: new UserError("This client is not connected to a server."),
        });
        return;
    }
    try {
        const access = await context.runtime.operation("createPortShareAccessToken", {
            portShareId,
        });
        await target.navigate(access.portShare.url, access.token);
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "portShareOpenSettled", portShareId });
        // The external tab now holds the one-hour cookie; keep it fresh by
        // reissuing and re-exchanging at each server-provided refreshAfter.
        context.portShareLeaseStart?.({
            chatId,
            portShareId,
            url: access.portShare.url,
            refreshAfter: access.refreshAfter,
            target,
        });
    } catch (error) {
        target.release();
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({ type: "portShareOpenFailed", portShareId, error: userError(error) });
    }
}

/** A port share may be opened or disabled only when it is present in the loaded active list. */
function portShareActive(
    snapshot: ChatSnapshot,
    portShareId: string,
): PortShareSummary | undefined {
    if (snapshot.portShares.type !== "ready") return undefined;
    return snapshot.portShares.value.find((share) => share.id === portShareId);
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
        pluginRequests: { type: "unloaded" },
        documentWriteRequests: { type: "unloaded" },
        documentWriteRequestPendingIds: [],
        pluginRequestPendingIds: [],
        portShares: { type: "unloaded" },
        portShareOpeningIds: [],
        portShareDisablingIds: [],
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
        pluginRequestsRetain(): void {
            const current = get().pluginRequests;
            if (current.type === "loading" || current.type === "ready") return;
            get().chatInput({ type: "pluginRequestsLoading" });
            output({ type: "pluginRequestsRetained", chatId });
        },
        pluginRequestApprove(requestId): void {
            const request = pluginRequestActionable(get(), requestId);
            if (!request) return;
            get().chatInput({ type: "pluginRequestPending", requestId });
            output({
                type: "pluginRequestDecisionSubmitted",
                chatId,
                requestId,
                action: request.action,
                decision: "approve",
            });
        },
        pluginRequestDeny(requestId): void {
            const request = pluginRequestActionable(get(), requestId);
            if (!request) return;
            get().chatInput({ type: "pluginRequestPending", requestId });
            output({
                type: "pluginRequestDecisionSubmitted",
                chatId,
                requestId,
                action: request.action,
                decision: "deny",
            });
        },
        documentWriteRequestsRetain(): void {
            const current = get().documentWriteRequests;
            if (current.type === "loading" || current.type === "ready") return;
            get().chatInput({ type: "documentWriteRequestsLoading" });
            output({ type: "documentWriteRequestsRetained", chatId });
        },
        documentWriteRequestApprove(requestId): void {
            if (!documentWriteRequestActionable(get(), requestId)) return;
            get().chatInput({ type: "documentWriteRequestPending", requestId });
            output({
                type: "documentWriteRequestDecisionSubmitted",
                chatId,
                requestId,
                decision: "approve",
            });
        },
        documentWriteRequestDeny(requestId): void {
            if (!documentWriteRequestActionable(get(), requestId)) return;
            get().chatInput({ type: "documentWriteRequestPending", requestId });
            output({
                type: "documentWriteRequestDecisionSubmitted",
                chatId,
                requestId,
                decision: "deny",
            });
        },
        portSharesRetain(): void {
            const current = get().portShares;
            if (current.type === "loading" || current.type === "ready") return;
            get().chatInput({ type: "portSharesLoading" });
            output({ type: "portSharesRetained", chatId });
        },
        portShareOpen(portShareId): void {
            const snapshot = get();
            if (!portShareActive(snapshot, portShareId)) return;
            if (
                snapshot.portShareOpeningIds.includes(portShareId) ||
                snapshot.portShareDisablingIds.includes(portShareId)
            )
                return;
            get().chatInput({ type: "portShareOpenPending", portShareId });
            output({ type: "portShareOpenSubmitted", chatId, portShareId });
        },
        portShareDisable(portShareId): void {
            const snapshot = get();
            if (!portShareActive(snapshot, portShareId)) return;
            if (snapshot.portShareDisablingIds.includes(portShareId)) return;
            get().chatInput({ type: "portShareDisablePending", portShareId });
            output({ type: "portShareDisableSubmitted", chatId, portShareId });
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
                        if (index < 0) {
                            const messages = sorted([...snapshot.messages, event.item]);
                            return agentEffortMessageApply(
                                {
                                    ...snapshot,
                                    messages,
                                },
                                event.item,
                            );
                        }
                        if (
                            snapshot.messages[index] === event.item ||
                            messageItemEquivalent(snapshot.messages[index]!, event.item)
                        )
                            return snapshot;
                        const messages = [...snapshot.messages];
                        messages[index] = event.item;
                        return agentEffortMessageApply(
                            { ...snapshot, messages: sorted(messages) },
                            event.item,
                        );
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
                    case "documentWriteRequestsLoading":
                        return snapshot.documentWriteRequests.type === "loading" ||
                            snapshot.documentWriteRequests.type === "ready"
                            ? snapshot
                            : { ...snapshot, documentWriteRequests: { type: "loading" } };
                    case "documentWriteRequestsLoaded": {
                        // Preserve references for unchanged requests so cards keep
                        // their identity across ordinary reconciliation reads.
                        const previous =
                            snapshot.documentWriteRequests.type === "ready"
                                ? snapshot.documentWriteRequests.value
                                : [];
                        const value = event.requests.map((request) => {
                            const before = previous.find(
                                (candidate) => candidate.id === request.id,
                            );
                            return before &&
                                before.status === request.status &&
                                before.updatedAt === request.updatedAt
                                ? before
                                : request;
                        });
                        const unchanged =
                            snapshot.documentWriteRequests.type === "ready" &&
                            previous.length === value.length &&
                            previous.every((request, index) => request === value[index]);
                        return {
                            ...snapshot,
                            documentWriteRequests: unchanged
                                ? snapshot.documentWriteRequests
                                : { type: "ready", value },
                            documentWriteRequestPendingIds:
                                snapshot.documentWriteRequestPendingIds.filter(
                                    (id) =>
                                        event.requests.find((request) => request.id === id)
                                            ?.status === "pending",
                                ),
                        };
                    }
                    case "documentWriteRequestsFailed":
                        return {
                            ...snapshot,
                            documentWriteRequests:
                                snapshot.documentWriteRequests.type === "ready"
                                    ? snapshot.documentWriteRequests
                                    : { type: "error", error: event.error },
                        };
                    case "documentWriteRequestPending":
                        return {
                            ...snapshot,
                            documentWriteRequestPendingIds:
                                snapshot.documentWriteRequestPendingIds.includes(event.requestId)
                                    ? snapshot.documentWriteRequestPendingIds
                                    : [...snapshot.documentWriteRequestPendingIds, event.requestId],
                            documentWriteRequestActionError: undefined,
                        };
                    case "documentWriteRequestReconciled": {
                        const pendingIds = snapshot.documentWriteRequestPendingIds.filter(
                            (id) => id !== event.request.id,
                        );
                        if (snapshot.documentWriteRequests.type !== "ready")
                            return { ...snapshot, documentWriteRequestPendingIds: pendingIds };
                        const existing = snapshot.documentWriteRequests.value.findIndex(
                            (request) => request.id === event.request.id,
                        );
                        const value =
                            existing < 0
                                ? [...snapshot.documentWriteRequests.value, event.request]
                                : snapshot.documentWriteRequests.value.map((request, index) =>
                                      index === existing ? event.request : request,
                                  );
                        return {
                            ...snapshot,
                            documentWriteRequests: { type: "ready", value },
                            documentWriteRequestPendingIds: pendingIds,
                        };
                    }
                    case "documentWriteRequestDecisionFailed":
                        return {
                            ...snapshot,
                            documentWriteRequestPendingIds:
                                snapshot.documentWriteRequestPendingIds.filter(
                                    (id) => id !== event.requestId,
                                ),
                            documentWriteRequestActionError: event.error,
                        };
                    case "pluginRequestsLoading":
                        return snapshot.pluginRequests.type === "loading" ||
                            snapshot.pluginRequests.type === "ready"
                            ? snapshot
                            : { ...snapshot, pluginRequests: { type: "loading" } };
                    case "pluginRequestsLoaded": {
                        // Preserve references for unchanged requests so rows keep
                        // their identity across ordinary reconciliation reads.
                        const previous =
                            snapshot.pluginRequests.type === "ready"
                                ? snapshot.pluginRequests.value
                                : [];
                        const value = event.requests.map((request) => {
                            const before = previous.find(
                                (candidate) => candidate.id === request.id,
                            );
                            return before && pluginRequestEquivalent(before, request)
                                ? before
                                : request;
                        });
                        const unchanged =
                            snapshot.pluginRequests.type === "ready" &&
                            previous.length === value.length &&
                            previous.every((request, index) => request === value[index]);
                        return {
                            ...snapshot,
                            pluginRequests: unchanged
                                ? snapshot.pluginRequests
                                : { type: "ready", value },
                            // A decision that resolved on another surface arrives through
                            // this durable read; its local busy marker must not survive it.
                            pluginRequestPendingIds: snapshot.pluginRequestPendingIds.filter(
                                (id) =>
                                    event.requests.find((request) => request.id === id)?.status ===
                                    "pending",
                            ),
                        };
                    }
                    case "pluginRequestsFailed":
                        return {
                            ...snapshot,
                            pluginRequests:
                                snapshot.pluginRequests.type === "ready"
                                    ? snapshot.pluginRequests
                                    : { type: "error", error: event.error },
                        };
                    case "pluginRequestPending":
                        return {
                            ...snapshot,
                            pluginRequestPendingIds: snapshot.pluginRequestPendingIds.includes(
                                event.requestId,
                            )
                                ? snapshot.pluginRequestPendingIds
                                : [...snapshot.pluginRequestPendingIds, event.requestId],
                            pluginRequestActionError: undefined,
                        };
                    case "pluginRequestReconciled": {
                        if (snapshot.pluginRequests.type !== "ready")
                            return {
                                ...snapshot,
                                pluginRequestPendingIds: snapshot.pluginRequestPendingIds.filter(
                                    (id) => id !== event.request.id,
                                ),
                            };
                        const existing = snapshot.pluginRequests.value.findIndex(
                            (request) => request.id === event.request.id,
                        );
                        const value =
                            existing < 0
                                ? [...snapshot.pluginRequests.value, event.request]
                                : snapshot.pluginRequests.value.map((request, index) =>
                                      index === existing ? event.request : request,
                                  );
                        return {
                            ...snapshot,
                            pluginRequests: { type: "ready", value },
                            pluginRequestPendingIds: snapshot.pluginRequestPendingIds.filter(
                                (id) => id !== event.request.id,
                            ),
                        };
                    }
                    case "pluginRequestDecisionFailed":
                        return {
                            ...snapshot,
                            pluginRequestPendingIds: snapshot.pluginRequestPendingIds.filter(
                                (id) => id !== event.requestId,
                            ),
                            pluginRequestActionError: event.error,
                        };
                    case "portSharesLoading":
                        return snapshot.portShares.type === "loading" ||
                            snapshot.portShares.type === "ready"
                            ? snapshot
                            : { ...snapshot, portShares: { type: "loading" } };
                    case "portSharesLoaded": {
                        // Preserve references for unchanged shares so header and
                        // panel rows keep their identity across reconciliation reads.
                        const previous =
                            snapshot.portShares.type === "ready" ? snapshot.portShares.value : [];
                        const value = event.portShares.map((share) => {
                            const before = previous.find((candidate) => candidate.id === share.id);
                            return before && portShareEquivalent(before, share) ? before : share;
                        });
                        const unchanged =
                            snapshot.portShares.type === "ready" &&
                            previous.length === value.length &&
                            previous.every((share, index) => share === value[index]);
                        const presentIds = new Set(value.map((share) => share.id));
                        // The single displayable action error belongs to the active
                        // share identity; a durable read that replaces which shares
                        // are active drops a stale error, while an equivalent
                        // reconcile of the same identity keeps it.
                        const identityChanged =
                            previous.length !== value.length ||
                            previous.some((share, index) => share.id !== value[index]?.id);
                        return {
                            ...snapshot,
                            portShares: unchanged ? snapshot.portShares : { type: "ready", value },
                            portShareOpeningIds: filterPreserving(
                                snapshot.portShareOpeningIds,
                                (id) => presentIds.has(id),
                            ),
                            portShareDisablingIds: filterPreserving(
                                snapshot.portShareDisablingIds,
                                (id) => presentIds.has(id),
                            ),
                            portShareActionError: identityChanged
                                ? undefined
                                : snapshot.portShareActionError,
                        };
                    }
                    case "portSharesFailed":
                        return {
                            ...snapshot,
                            portShares:
                                snapshot.portShares.type === "ready"
                                    ? snapshot.portShares
                                    : { type: "error", error: event.error },
                        };
                    case "portShareOpenPending":
                        return {
                            ...snapshot,
                            portShareOpeningIds: snapshot.portShareOpeningIds.includes(
                                event.portShareId,
                            )
                                ? snapshot.portShareOpeningIds
                                : [...snapshot.portShareOpeningIds, event.portShareId],
                            portShareActionError: undefined,
                        };
                    case "portShareOpenSettled":
                        return {
                            ...snapshot,
                            portShareOpeningIds: filterPreserving(
                                snapshot.portShareOpeningIds,
                                (id) => id !== event.portShareId,
                            ),
                        };
                    case "portShareOpenFailed":
                        return {
                            ...snapshot,
                            portShareOpeningIds: filterPreserving(
                                snapshot.portShareOpeningIds,
                                (id) => id !== event.portShareId,
                            ),
                            portShareActionError: event.error,
                        };
                    case "portShareDisablePending":
                        return {
                            ...snapshot,
                            portShareDisablingIds: snapshot.portShareDisablingIds.includes(
                                event.portShareId,
                            )
                                ? snapshot.portShareDisablingIds
                                : [...snapshot.portShareDisablingIds, event.portShareId],
                            portShareActionError: undefined,
                        };
                    case "portShareDisableSettled":
                        return {
                            ...snapshot,
                            portShareDisablingIds: filterPreserving(
                                snapshot.portShareDisablingIds,
                                (id) => id !== event.portShareId,
                            ),
                        };
                    case "portShareDisableFailed":
                        return {
                            ...snapshot,
                            portShareDisablingIds: filterPreserving(
                                snapshot.portShareDisablingIds,
                                (id) => id !== event.portShareId,
                            ),
                            portShareActionError: event.error,
                        };
                    case "portShareLeaseFailed":
                        return { ...snapshot, portShareActionError: event.error };
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
                        return agentEffortMessageApply(
                            {
                                ...snapshot,
                                agentEffort: {
                                    ...snapshot.agentEffort,
                                    [event.value.agentUserId]: {
                                        type: "ready",
                                        value: event.value,
                                    },
                                },
                            },
                            latestAgentEffortMessage(snapshot.messages, event.value.agentUserId),
                        );
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
    readonly pluginRequests: Loadable<readonly PluginManagementRequestSummary[]>;
    readonly documentWriteRequests: Loadable<readonly DocumentWriteRequestSummary[]>;
    readonly documentWriteRequestPendingIds: readonly string[];
    readonly documentWriteRequestActionError?: UserError;
    /** Request ids whose approve/deny decision is still in flight from this surface. */
    readonly pluginRequestPendingIds: readonly string[];
    readonly pluginRequestActionError?: UserError;
    readonly portShares: Loadable<readonly PortShareSummary[]>;
    /** Share ids whose open (token issuance + cookie exchange) is in flight from this surface. */
    readonly portShareOpeningIds: readonly string[];
    /** Share ids whose disable is in flight from this surface. */
    readonly portShareDisablingIds: readonly string[];
    readonly portShareActionError?: UserError;
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
    | { readonly type: "pluginRequestsRetained"; readonly chatId: string }
    | { readonly type: "documentWriteRequestsRetained"; readonly chatId: string }
    | {
          readonly type: "documentWriteRequestDecisionSubmitted";
          readonly chatId: string;
          readonly requestId: string;
          readonly decision: "approve" | "deny";
      }
    | { readonly type: "portSharesRetained"; readonly chatId: string }
    | {
          readonly type: "portShareOpenSubmitted";
          readonly chatId: string;
          readonly portShareId: string;
      }
    | {
          readonly type: "portShareDisableSubmitted";
          readonly chatId: string;
          readonly portShareId: string;
      }
    | {
          readonly type: "pluginRequestDecisionSubmitted";
          readonly chatId: string;
          readonly requestId: string;
          readonly action: PluginManagementRequestSummary["action"];
          readonly decision: "approve" | "deny";
      }
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
    | { readonly type: "documentWriteRequestsLoading" }
    | {
          readonly type: "documentWriteRequestsLoaded";
          readonly requests: readonly DocumentWriteRequestSummary[];
      }
    | { readonly type: "documentWriteRequestsFailed"; readonly error: UserError }
    | { readonly type: "documentWriteRequestPending"; readonly requestId: string }
    | {
          readonly type: "documentWriteRequestReconciled";
          readonly request: DocumentWriteRequestSummary;
      }
    | {
          readonly type: "documentWriteRequestDecisionFailed";
          readonly requestId: string;
          readonly error: UserError;
      }
    | { readonly type: "pluginRequestsLoading" }
    | {
          readonly type: "pluginRequestsLoaded";
          readonly requests: readonly PluginManagementRequestSummary[];
      }
    | { readonly type: "pluginRequestsFailed"; readonly error: UserError }
    | { readonly type: "pluginRequestPending"; readonly requestId: string }
    | {
          readonly type: "pluginRequestReconciled";
          readonly request: PluginManagementRequestSummary;
      }
    | {
          readonly type: "pluginRequestDecisionFailed";
          readonly requestId: string;
          readonly error: UserError;
      }
    | { readonly type: "portSharesLoading" }
    | {
          readonly type: "portSharesLoaded";
          readonly portShares: readonly PortShareSummary[];
      }
    | { readonly type: "portSharesFailed"; readonly error: UserError }
    | { readonly type: "portShareOpenPending"; readonly portShareId: string }
    | { readonly type: "portShareOpenSettled"; readonly portShareId: string }
    | {
          readonly type: "portShareOpenFailed";
          readonly portShareId: string;
          readonly error: UserError;
      }
    | { readonly type: "portShareDisablePending"; readonly portShareId: string }
    | { readonly type: "portShareDisableSettled"; readonly portShareId: string }
    | {
          readonly type: "portShareDisableFailed";
          readonly portShareId: string;
          readonly error: UserError;
      }
    | {
          readonly type: "portShareLeaseFailed";
          readonly portShareId: string;
          readonly error: UserError;
      }
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
    pluginRequestsRetain(): void;
    pluginRequestApprove(requestId: string): void;
    documentWriteRequestsRetain(): void;
    documentWriteRequestApprove(requestId: string): void;
    documentWriteRequestDeny(requestId: string): void;
    pluginRequestDeny(requestId: string): void;
    portSharesRetain(): void;
    portShareOpen(portShareId: string): void;
    portShareDisable(portShareId: string): void;
    reactionActorsRetain(messageId: string, reactionKey: string): void;
    agentEffortRetain(agentUserId: string): void;
    agentEffortChange(agentUserId: string, effort: string): void;
    chatInput(event: ChatInput): void;
}

export type ChatStore = StoreApi<ChatState>;

export interface ChatHandle extends ChatStore, Disposable {}

function agentEffortMessageApply(snapshot: ChatState, item?: ChatMessageItem): ChatState {
    if (!item) return snapshot;
    const service = item.message.service;
    if (service?.type !== "agent_effort_changed") return snapshot;
    const current = snapshot.agentEffort[service.agentUserId];
    if (current?.type !== "ready" || current.value.effort === service.effort) return snapshot;
    const newest = [...snapshot.messages]
        .reverse()
        .find(
            (candidate) =>
                candidate.message.service?.type === "agent_effort_changed" &&
                candidate.message.service.agentUserId === service.agentUserId,
        );
    if (newest !== item) return snapshot;
    return {
        ...snapshot,
        agentEffort: {
            ...snapshot.agentEffort,
            [service.agentUserId]: {
                type: "ready",
                value: { ...current.value, effort: service.effort },
            },
        },
    };
}

/** Returns the newest retained effort notice for one agent, if sync history has one. */
function latestAgentEffortMessage(
    messages: readonly ChatMessageItem[],
    agentUserId: string,
): ChatMessageItem | undefined {
    return [...messages]
        .reverse()
        .find(
            (item) =>
                item.message.service?.type === "agent_effort_changed" &&
                item.message.service.agentUserId === agentUserId,
        );
}

export function reactionActorsKey(messageId: string, reactionKey: string): string {
    return `${messageId}\u0000${reactionKey}`;
}

/** Field-complete equality over the closed request summary; equal requests keep their reference. */
function pluginRequestEquivalent(
    left: PluginManagementRequestSummary,
    right: PluginManagementRequestSummary,
): boolean {
    return (
        left.id === right.id &&
        left.action === right.action &&
        left.status === right.status &&
        left.chatId === right.chatId &&
        left.agentUserId === right.agentUserId &&
        left.requesterInstallationId === right.requesterInstallationId &&
        left.displayName === right.displayName &&
        left.shortName === right.shortName &&
        left.description === right.description &&
        left.reason === right.reason &&
        left.sourceKind === right.sourceKind &&
        left.sourceReference === right.sourceReference &&
        left.targetInstallationId === right.targetInstallationId &&
        left.createdAt === right.createdAt &&
        left.resolvedAt === right.resolvedAt &&
        left.resolvedByUserId === right.resolvedByUserId &&
        left.installationId === right.installationId &&
        left.lastError === right.lastError
    );
}

/** Field-complete equality over the closed port-share projection; equal shares keep their reference. */
function portShareEquivalent(left: PortShareSummary, right: PortShareSummary): boolean {
    return (
        left.id === right.id &&
        left.chatId === right.chatId &&
        left.agentUserId === right.agentUserId &&
        left.containerPort === right.containerPort &&
        left.name === right.name &&
        left.subdomain === right.subdomain &&
        left.createdByUserId === right.createdByUserId &&
        left.createdAt === right.createdAt &&
        left.disabledAt === right.disabledAt &&
        left.disabledByUserId === right.disabledByUserId &&
        left.url === right.url
    );
}

/** Filters a readonly id list but returns the original reference when nothing was removed. */
function filterPreserving(
    ids: readonly string[],
    keep: (id: string) => boolean,
): readonly string[] {
    const next = ids.filter(keep);
    return next.length === ids.length ? ids : next;
}

/** A decision may target only a loaded, still-pending request without an in-flight decision. */
function pluginRequestActionable(
    snapshot: ChatSnapshot,
    requestId: string,
): PluginManagementRequestSummary | undefined {
    if (snapshot.pluginRequests.type !== "ready") return undefined;
    if (snapshot.pluginRequestPendingIds.includes(requestId)) return undefined;
    const request = snapshot.pluginRequests.value.find((candidate) => candidate.id === requestId);
    return request?.status === "pending" ? request : undefined;
}

function documentWriteRequestActionable(
    snapshot: ChatSnapshot,
    requestId: string,
): DocumentWriteRequestSummary | undefined {
    if (snapshot.documentWriteRequests.type !== "ready") return undefined;
    if (snapshot.documentWriteRequestPendingIds.includes(requestId)) return undefined;
    const request = snapshot.documentWriteRequests.value.find(
        (candidate) => candidate.id === requestId,
    );
    return request?.status === "pending" ? request : undefined;
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
