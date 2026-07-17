import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { NotificationsStoreBinding } from "./notificationsStore.js";
import type { NotificationsOutput } from "./notificationsTypes.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";

export interface NotificationsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly notifications: NotificationsStoreBinding;
}
const generations = new WeakMap<NotificationsStoreBinding, number>();

/** Loads the notification center. */
export async function notificationsLoad(
    context: NotificationsActionContext,
    append = false,
): Promise<void> {
    const generation = (generations.get(context.notifications) ?? 0) + 1;
    generations.set(context.notifications, generation);
    const before = append ? context.notifications.store.get().nextCursor : undefined;
    if (!append) context.notifications.notificationsInput({ type: "notificationsLoading" });
    try {
        const result = await context.runtime.operation("getNotifications", { limit: 100, before });
        if (generations.get(context.notifications) !== generation) return;
        if (append && context.notifications.store.get().nextCursor !== before) return;
        const missingActors = result.notifications.some(
            ({ actorUserId }) => actorUserId && !context.identities.get(actorUserId),
        );
        if (missingActors) {
            const contacts = await context.runtime.operation("getContacts").catch(() => undefined);
            if (generations.get(context.notifications) !== generation) return;
            for (const user of contacts?.users ?? []) context.identities.project(user);
        }
        context.notifications.notificationsInput({
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
        context.notifications.notificationsInput({
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
        context.notifications.notificationsInput({ type: "notificationsReadSucceeded" });
    } catch (error) {
        context.notifications.notificationsInput({
            type: "notificationsReadFailed",
            error: userError(error),
        });
    }
}
