import type { NotificationProjection, NotificationsStore } from "happy2-state";
import { createMemo, createSignal, Show } from "solid-js";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { NotificationList, type NotificationItem } from "../../NotificationList";
import { SegmentedControl } from "../../SegmentedControl";
import { StoreSurface } from "../../StoreSurface";
import { Toolbar } from "../../Toolbar";

export interface ActivityPageProps {
    store: NotificationsStore;
    imageUrl?: (fileId?: string) => string | undefined;
    onSelect?: (id: string) => void;
}

/** Complete activity inbox backed by one NotificationsStore. */
export function ActivityPage(props: ActivityPageProps) {
    const [filter, setFilter] = createSignal<"all" | "unread">("all");
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const source = createMemo(() => {
                    const notifications = snapshot().notifications;
                    return notifications.type === "ready"
                        ? notifications.value.map((item) => notificationItem(item, props.imageUrl))
                        : [];
                });
                const unreadCount = createMemo(() => source().filter((item) => item.unread).length);
                const visible = createMemo(() =>
                    filter() === "unread" ? source().filter((item) => item.unread) : source(),
                );
                return (
                    <Show
                        when={source().length > 0}
                        fallback={
                            <EmptyState
                                description="Mentions, replies, reactions, and system events collect here."
                                icon="bell"
                                title={
                                    snapshot().notifications.type === "loading"
                                        ? "Loading activity…"
                                        : "Activity"
                                }
                            />
                        }
                    >
                        <Box
                            style={{
                                display: "flex",
                                flex: "1 1 0%",
                                "flex-direction": "column",
                                "min-height": 0,
                            }}
                        >
                            <Toolbar
                                subtitle={
                                    unreadCount() === 0
                                        ? `All ${source().length} read`
                                        : `${unreadCount()} unread · ${source().length} total`
                                }
                                title="Activity"
                                trailing={
                                    <>
                                        <SegmentedControl
                                            onChange={(value) =>
                                                setFilter(value as "all" | "unread")
                                            }
                                            segments={[
                                                { value: "all", label: "All" },
                                                { value: "unread", label: "Unread" },
                                            ]}
                                            size="small"
                                            value={filter()}
                                        />
                                        <Button
                                            disabled={unreadCount() === 0}
                                            icon="check"
                                            onClick={store.notificationsReadAll}
                                            size="small"
                                            variant="secondary"
                                        >
                                            Mark all read
                                        </Button>
                                    </>
                                }
                            />
                            <Box
                                style={{
                                    flex: "1 1 0%",
                                    "min-height": 0,
                                    "overflow-y": "auto",
                                    padding: "12px",
                                }}
                            >
                                <Show
                                    when={visible().length > 0}
                                    fallback={
                                        <EmptyState
                                            action={{
                                                label: "View all",
                                                icon: "bell",
                                                onClick: () => setFilter("all"),
                                            }}
                                            description="No unread notifications right now."
                                            icon="check-circle"
                                            title="You're all caught up"
                                        />
                                    }
                                >
                                    <NotificationList
                                        notifications={visible()}
                                        onSelect={(id) => {
                                            store.notificationsRead([id]);
                                            props.onSelect?.(id);
                                        }}
                                    />
                                </Show>
                            </Box>
                        </Box>
                    </Show>
                );
            }}
        </StoreSurface>
    );
}

function notificationItem(
    item: NotificationProjection,
    imageUrl?: (fileId?: string) => string | undefined,
): NotificationItem {
    return {
        id: item.id,
        kind: item.kind,
        actor: item.actor
            ? {
                  name: item.actor.displayName,
                  initials: initials(item.actor.displayName),
                  imageUrl: imageUrl?.(item.actor.photoFileId),
              }
            : undefined,
        text: notificationText(item.kind),
        context: item.chatId,
        time: formatDate(item.createdAt),
        unread: item.readAt === undefined,
    };
}
function notificationText(kind: NotificationProjection["kind"]): string {
    return kind.replaceAll("_", " ");
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
