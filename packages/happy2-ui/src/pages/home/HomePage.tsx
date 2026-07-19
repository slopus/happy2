import type { NotificationProjection, NotificationsStore } from "happy2-state";
import { Box } from "../../Box";
import { EmptyState } from "../../EmptyState";
import { NotificationList } from "../../NotificationList";
import { StatTile, type StatTileProps } from "../../StatTile";
import { StoreSurface } from "../../StoreSurface";
export interface HomePageProps {
    notificationsStore: NotificationsStore;
    imageUrl?: (fileId?: string) => string | undefined;
    contextLabel?: (notification: NotificationProjection) => string | undefined;
    onSelect?: (notification: NotificationProjection) => void;
}
/** Complete day-at-a-glance page projected from the retained notification surface. */
export function HomePage(props: HomePageProps) {
    return (
        <StoreSurface store={props.notificationsStore}>
            {(snapshot, store) => {
                const notifications = (() => {
                    const state = snapshot.notifications;
                    return state.type === "ready" ? state.value : [];
                })();
                const stats: StatTileProps[] = (() => {
                    const unread = notifications.filter((item) => !item.readAt).length;
                    const mentions = notifications.filter(
                        (item) => item.kind === "mention" && !item.readAt,
                    ).length;
                    return [
                        {
                            label: "Unread",
                            value: String(unread),
                            icon: "bell",
                            tone: unread ? "accent" : "neutral",
                        },
                        {
                            label: "Mentions",
                            value: String(mentions),
                            icon: "at",
                            tone: mentions ? "warning" : "neutral",
                        },
                        {
                            label: "Threads",
                            value: String(
                                notifications.filter((item) => item.kind === "thread_reply").length,
                            ),
                            icon: "thread",
                            tone: "accent",
                        },
                        {
                            label: "Calls",
                            value: String(
                                notifications.filter((item) => item.kind === "call").length,
                            ),
                            icon: "mic",
                            tone: "success",
                        },
                    ];
                })();
                const recentNotifications = notifications.slice(0, 6);
                const recent = recentNotifications.map((item) => ({
                    id: item.id,
                    kind: item.kind,
                    actor: item.actor
                        ? {
                              name: item.actor.displayName,
                              initials: initials(item.actor.displayName),
                              imageUrl: props.imageUrl?.(item.actor.photoFileId),
                          }
                        : undefined,
                    text: notificationText(item.kind),
                    context: props.contextLabel?.(item),
                    time: formatDate(item.createdAt),
                    unread: !item.readAt,
                }));
                return (
                    <Box
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                            height: "100%",
                            minHeight: "0",
                            overflow: "hidden",
                            padding: "20px",
                        }}
                    >
                        <Box style={{ display: "flex", gap: "12px", flex: "none" }}>
                            {stats.map((stat) => (
                                <Box key={stat.label} style={{ flex: "1 1 0%" }}>
                                    <StatTile {...stat} />
                                </Box>
                            ))}
                        </Box>
                        <Box
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                flex: "1 1 0%",
                                minHeight: "0",
                                overflowY: "auto",
                            }}
                        >
                            {recent.length > 0 ? (
                                <NotificationList
                                    notifications={recent}
                                    onSelect={(id) => {
                                        const notification = recentNotifications.find(
                                            (item) => item.id === id,
                                        );
                                        if (!notification) return;
                                        store.notificationsRead([id]);
                                        props.onSelect?.(notification);
                                    }}
                                />
                            ) : (
                                <EmptyState
                                    description="Nothing needs your attention right now."
                                    icon="home"
                                    title="You’re all caught up"
                                />
                            )}
                        </Box>
                    </Box>
                );
            }}
        </StoreSurface>
    );
}
function notificationText(kind: NotificationProjection["kind"]): string {
    switch (kind) {
        case "mention":
            return "mentioned you";
        case "thread_reply":
            return "replied in a thread";
        case "direct_message":
            return "sent you a direct message";
        case "reaction":
            return "reacted to your message";
        case "call":
            return "started a call";
        case "moderation":
            return "updated a moderation report";
        case "automation":
            return "ran an automation";
        case "system":
            return "posted a system update";
    }
}
function initials(value: string): string {
    return value
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
    );
}
