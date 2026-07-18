import { createStore, type StoreApi } from "zustand/vanilla";
import { type NotificationSummary, type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface NotificationsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly notifications: NotificationsStore;
}

const generations = new WeakMap<NotificationsStore, number>();

/** Loads the notification center. */
export async function notificationsLoad(
    context: NotificationsActionContext,
    append = false,
): Promise<void> {
    const generation = (generations.get(context.notifications) ?? 0) + 1;
    generations.set(context.notifications, generation);
    const before = append ? context.notifications.getState().nextCursor : undefined;
    if (!append)
        context.notifications.getState().notificationsInput({ type: "notificationsLoading" });
    try {
        const result = await context.runtime.operation("getNotifications", { limit: 100, before });
        if (generations.get(context.notifications) !== generation) return;
        if (append && context.notifications.getState().nextCursor !== before) return;
        const missingActors = result.notifications.some(
            ({ actorUserId }) => actorUserId && !context.identities.get(actorUserId),
        );
        if (missingActors) {
            const contacts = await context.runtime.operation("getContacts").catch(() => undefined);
            if (generations.get(context.notifications) !== generation) return;
            for (const user of contacts?.users ?? []) context.identities.project(user);
        }
        context.notifications.getState().notificationsInput({
            type: "notificationsLoaded",
            notifications: result.notifications.map((notification) => ({
                id: notification.id,
                kind: notification.kind,
                chatId: notification.chatId,
                messageId: notification.messageId,
                threadRootMessageId: notification.threadRootMessageId,
                actorUserId: notification.actorUserId,
                readAt: notification.readAt,
                createdAt: notification.createdAt,
                ...(notification.actorUserId
                    ? { actor: context.identities.get(notification.actorUserId) }
                    : {}),
            })),
            nextCursor: result.nextCursor,
            append,
        });
    } catch (error) {
        if (generations.get(context.notifications) !== generation) return;
        context.notifications.getState().notificationsInput({
            type: append ? "notificationsPageFailed" : "notificationsFailed",
            error: userError(error),
        });
    }
}

/** Marks notifications durable, projecting read state only after success. */
export async function notificationsOutputRoute(
    context: NotificationsActionContext,
    event: NotificationsOutput,
): Promise<void> {
    if (event.type === "notificationsMoreRequested") {
        await notificationsLoad(context, true);
        return;
    }
    try {
        await context.runtime.operation(
            "markNotificationsRead",
            "all" in event ? { all: true } : { notificationIds: event.notificationIds },
        );
        await notificationsLoad(context);
        context.notifications.getState().notificationsInput({ type: "notificationsReadSucceeded" });
    } catch (error) {
        context.notifications.getState().notificationsInput({
            type: "notificationsReadFailed",
            error: userError(error),
        });
    }
}

/** Creates one notification-center store with optimistic read projection. */
export function notificationsStoreCreate(
    output: (event: NotificationsOutput) => void = () => undefined,
): NotificationsStore {
    return createStore<NotificationsState>()((set, get) => ({
        notifications: { type: "unloaded" },
        readState: { type: "idle" },
        notificationsRead(notificationIds): void {
            set({ readState: { type: "saving" } });
            output({ type: "notificationsReadSubmitted", notificationIds });
        },
        notificationsReadAll(): void {
            set({ readState: { type: "saving" } });
            output({ type: "notificationsReadSubmitted", all: true });
        },
        notificationsMore(): void {
            const snapshot = get();
            if (
                snapshot.notifications.type === "ready" &&
                snapshot.nextCursor &&
                !snapshot.pageLoading
            ) {
                set({ pageLoading: true, pageError: undefined });
                output({ type: "notificationsMoreRequested" });
            }
        },
        notificationsInput(event): void {
            set((snapshot) => {
                if (event.type === "notificationsLoading")
                    return {
                        ...snapshot,
                        notifications: { type: "loading" },
                        pageLoading: false,
                        pageError: undefined,
                    };
                if (event.type === "notificationsFailed")
                    return {
                        ...snapshot,
                        notifications: { type: "error", error: event.error },
                        pageLoading: false,
                    };
                if (event.type === "notificationsPageFailed")
                    return { ...snapshot, pageLoading: false, pageError: event.error };
                if (event.type === "notificationsReadFailed")
                    return { ...snapshot, readState: { type: "error", error: event.error } };
                if (event.type === "notificationsReadSucceeded")
                    return { ...snapshot, readState: { type: "idle" } };
                if (event.type === "notificationsLoaded") {
                    const current =
                        event.append && snapshot.notifications.type === "ready"
                            ? snapshot.notifications.value
                            : [];
                    const known = new Set(current.map((notification) => notification.id));
                    return {
                        notifications: {
                            type: "ready",
                            value: [
                                ...current,
                                ...event.notifications.filter(
                                    (notification) => !known.has(notification.id),
                                ),
                            ],
                        },
                        nextCursor: event.nextCursor,
                        pageLoading: false,
                        pageError: undefined,
                        readState: snapshot.readState,
                    };
                }
                return snapshot;
            });
        },
    }));
}

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
    readonly pageLoading?: boolean;
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

export interface NotificationsState extends NotificationsSnapshot {
    notificationsRead(notificationIds: readonly [string, ...string[]]): void;
    notificationsReadAll(): void;
    notificationsMore(): void;
    notificationsInput(event: NotificationsInput): void;
}

export type NotificationsStore = StoreApi<NotificationsState>;
