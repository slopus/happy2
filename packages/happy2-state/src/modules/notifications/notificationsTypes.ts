import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { NotificationSummary, UserError } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";
import type { IdentityProjection } from "../identity/identityTypes.js";

export interface NotificationProjection {
    readonly id: string;
    readonly kind: NotificationSummary["kind"];
    readonly chatId?: string;
    readonly messageId?: string;
    readonly threadRootMessageId?: string;
    readonly actorUserId?: string;
    readonly readAt?: string;
    readonly createdAt: string;
    readonly actor?: IdentityProjection;
}

export interface NotificationsSnapshot {
    readonly notifications: Loadable<readonly NotificationProjection[]>;
    readonly nextCursor?: string;
    readonly pageError?: UserError;
    readonly readState:
        | { readonly type: "idle" }
        | { readonly type: "saving" }
        | { readonly type: "error"; readonly error: UserError };
}
export type NotificationsOutput =
    | {
          readonly type: "notificationsReadSubmitted";
          readonly notificationIds: readonly [string, ...string[]];
      }
    | { readonly type: "notificationsReadSubmitted"; readonly all: true }
    | { readonly type: "notificationsMoreRequested" };
export type NotificationsInput =
    | { readonly type: "notificationsLoading" }
    | {
          readonly type: "notificationsLoaded";
          readonly notifications: readonly NotificationProjection[];
          readonly nextCursor?: string;
          readonly append?: boolean;
      }
    | { readonly type: "notificationsFailed"; readonly error: UserError }
    | { readonly type: "notificationsPageFailed"; readonly error: UserError }
    | { readonly type: "notificationsReadSucceeded" }
    | { readonly type: "notificationsReadFailed"; readonly error: UserError };
export interface NotificationsStore extends ReadonlyStore<NotificationsSnapshot> {
    notificationsRead(notificationIds: readonly [string, ...string[]]): void;
    notificationsReadAll(): void;
    notificationsMore(): void;
}
