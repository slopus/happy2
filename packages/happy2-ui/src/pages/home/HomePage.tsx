import type { NotificationsStore } from "happy2-state";
import { createMemo, For, Show } from "solid-js";
import { Box } from "../../Box";
import { EmptyState } from "../../EmptyState";
import { NotificationList, type NotificationItem } from "../../NotificationList";
import { StatTile, type StatTileProps } from "../../StatTile";
import { StoreSurface } from "../../StoreSurface";

export interface HomePageProps {
    notificationsStore: NotificationsStore;
    imageUrl?: (fileId?: string) => string | undefined;
}

/** Complete day-at-a-glance page projected from the retained notification surface. */
export function HomePage(props: HomePageProps) {
    return (
        <StoreSurface store={props.notificationsStore}>
            {(snapshot) => {
                const notifications = createMemo(() => {
                    const state = snapshot().notifications;
                    return state.type === "ready" ? state.value : [];
                });
                const stats = createMemo<StatTileProps[]>(() => {
                    const unread = notifications().filter((item) => !item.readAt).length;
                    const mentions = notifications().filter(
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
                                notifications().filter((item) => item.kind === "thread_reply")
                                    .length,
                            ),
                            icon: "thread",
                            tone: "accent",
                        },
                        {
                            label: "Calls",
                            value: String(
                                notifications().filter((item) => item.kind === "call").length,
                            ),
                            icon: "mic",
                            tone: "success",
                        },
                    ];
                });
                const recent = createMemo<NotificationItem[]>(() =>
                    notifications()
                        .slice(0, 6)
                        .map((item) => ({
                            id: item.id,
                            kind: item.kind,
                            actor: item.actor
                                ? {
                                      name: item.actor.displayName,
                                      initials: initials(item.actor.displayName),
                                      imageUrl: props.imageUrl?.(item.actor.photoFileId),
                                  }
                                : undefined,
                            text: item.kind.replaceAll("_", " "),
                            context: item.chatId,
                            time: formatDate(item.createdAt),
                            unread: !item.readAt,
                        })),
                );
                return (
                    <Box
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            gap: "16px",
                            height: "100%",
                            "min-height": "0",
                            overflow: "hidden",
                            padding: "20px",
                        }}
                    >
                        <Box style={{ display: "flex", gap: "12px", flex: "none" }}>
                            <For each={stats()}>
                                {(stat) => (
                                    <Box style={{ flex: "1 1 0%" }}>
                                        <StatTile {...stat} />
                                    </Box>
                                )}
                            </For>
                        </Box>
                        <Box
                            style={{
                                display: "flex",
                                "flex-direction": "column",
                                flex: "1 1 0%",
                                "min-height": "0",
                                "overflow-y": "auto",
                            }}
                        >
                            <Show
                                when={recent().length > 0}
                                fallback={
                                    <EmptyState
                                        description="Your day at a glance — nothing needs you right now."
                                        icon="home"
                                        title="Home"
                                    />
                                }
                            >
                                <NotificationList notifications={recent()} />
                            </Show>
                        </Box>
                    </Box>
                );
            }}
        </StoreSurface>
    );
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
