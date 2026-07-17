import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { NotificationLevel, ThreadSummary, UserError } from "../../types.js";
import type { ChatMessageProjection, Loadable } from "../chat/chatTypes.js";

export interface ThreadSummaryProjection extends Omit<ThreadSummary, "root"> {
    readonly root: ChatMessageProjection;
}

export interface ThreadsSnapshot {
    readonly threads: Loadable<readonly ThreadSummaryProjection[]>;
    readonly nextCursor?: string;
    readonly pageError?: UserError;
    readonly actionError?: UserError;
}

export type ThreadsOutput =
    | { readonly type: "threadsMoreRequested" }
    | {
          readonly type: "threadReadSubmitted";
          readonly rootMessageId: string;
          readonly throughMessageId?: string;
      }
    | {
          readonly type: "threadSubscriptionSubmitted";
          readonly rootMessageId: string;
          readonly subscribed: boolean;
          readonly notificationLevel?: NotificationLevel;
      };

export type ThreadsInput =
    | { readonly type: "threadsLoading" }
    | {
          readonly type: "threadsLoaded";
          readonly threads: readonly ThreadSummaryProjection[];
          readonly nextCursor?: string;
          readonly append?: boolean;
      }
    | { readonly type: "threadsFailed"; readonly error: UserError }
    | { readonly type: "threadsPageFailed"; readonly error: UserError }
    | { readonly type: "threadActionFailed"; readonly error: UserError };

export interface ThreadsStore extends ReadonlyStore<ThreadsSnapshot> {
    threadReadMark(rootMessageId: string, throughMessageId?: string): void;
    threadSubscriptionSet(
        rootMessageId: string,
        subscribed: boolean,
        notificationLevel?: NotificationLevel,
    ): void;
    threadsMore(): void;
}
