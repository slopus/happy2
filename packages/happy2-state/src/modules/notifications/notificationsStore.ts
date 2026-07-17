import { storeCreate } from "../../kernel/store.js";
import type {
    NotificationsInput,
    NotificationsOutput,
    NotificationsSnapshot,
    NotificationsStore,
} from "./notificationsTypes.js";

export interface NotificationsStoreBinding {
    readonly store: NotificationsStore;
    notificationsInput(event: NotificationsInput): void;
    dispose(): void;
}

/** Creates one notification-center store with optimistic read projection. */
export function notificationsStoreCreateBinding(
    output: (event: NotificationsOutput) => void = () => undefined,
): NotificationsStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<NotificationsSnapshot>({
        notifications: { type: "unloaded" },
        readState: { type: "idle" },
    });
    let disposed = false;
    return {
        store: {
            ...readonlyStore,
            notificationsRead(notificationIds): void {
                if (disposed) return;
                writer.update((snapshot) => ({ ...snapshot, readState: { type: "saving" } }));
                output({ type: "notificationsReadSubmitted", notificationIds });
            },
            notificationsReadAll(): void {
                if (disposed) return;
                writer.update((snapshot) => ({ ...snapshot, readState: { type: "saving" } }));
                output({ type: "notificationsReadSubmitted", all: true });
            },
            notificationsMore(): void {
                if (disposed) return;
                const snapshot = readonlyStore.get();
                if (snapshot.notifications.type === "ready" && snapshot.nextCursor)
                    output({ type: "notificationsMoreRequested" });
            },
        },
        notificationsInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.type === "notificationsLoading")
                    return { ...snapshot, notifications: { type: "loading" } };
                if (event.type === "notificationsFailed")
                    return { ...snapshot, notifications: { type: "error", error: event.error } };
                if (event.type === "notificationsPageFailed")
                    return { ...snapshot, pageError: event.error };
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
                        readState: snapshot.readState,
                    };
                }
                return snapshot;
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
