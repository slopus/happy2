import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type {
    AgentActivityState,
    ChatPinSummary,
    ChatSummary,
    MessageSummary,
    PresenceSnapshot,
    TypingState,
    UserError,
} from "../../types.js";
import type { IdentityProjection } from "../identity/identityTypes.js";

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

export interface ChatStore extends ReadonlyStore<ChatSnapshot> {
    membersRetain(): void;
    pinsRetain(): void;
    reactionActorsRetain(messageId: string, reactionKey: string): void;
    agentEffortRetain(agentUserId: string): void;
    agentEffortChange(agentUserId: string, effort: string): void;
}

export interface ChatHandle extends ChatStore, Disposable {}

export function reactionActorsKey(messageId: string, reactionKey: string): string {
    return `${messageId}\u0000${reactionKey}`;
}
