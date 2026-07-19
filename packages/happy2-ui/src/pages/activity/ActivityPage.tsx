import { useState } from "react";
import type { NotificationProjection, NotificationsStore } from "happy2-state";
import { Banner } from "../../Banner";
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
    contextLabel?: (notification: NotificationProjection) => string | undefined;
    onSelect?: (notification: NotificationProjection) => void;
    virtualize?: boolean;
}
/** Complete activity inbox backed by one NotificationsStore. */
export function ActivityPage(props: ActivityPageProps) {
    const [filter, setFilter] = useState<"all" | "unread">("all");
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const source = (() => {
                    const notifications = snapshot.notifications;
                    return notifications.type === "ready"
                        ? notifications.value.map((item) =>
                              notificationItem(item, props.imageUrl, props.contextLabel),
                          )
                        : [];
                })();
                const unreadCount = source.filter((item) => item.unread).length;
                const visible = filter === "unread" ? source.filter((item) => item.unread) : source;
                return source.length > 0 ? (
                    <Box
                        style={{
                            display: "flex",
                            flex: "1 1 0%",
                            flexDirection: "column",
                            minHeight: 0,
                        }}
                    >
                        <Toolbar
                            subtitle={
                                unreadCount === 0
                                    ? `All ${source.length} read`
                                    : `${unreadCount} unread · ${source.length} total`
                            }
                            title="Activity"
                            trailing={
                                <>
                                    <SegmentedControl
                                        onChange={(value) => setFilter(value as "all" | "unread")}
                                        segments={[
                                            { value: "all", label: "All" },
                                            { value: "unread", label: "Unread" },
                                        ]}
                                        size="small"
                                        value={filter}
                                    />
                                    <Button
                                        disabled={
                                            unreadCount === 0 ||
                                            snapshot.readState.type === "saving"
                                        }
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
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                                flex: "1 1 0%",
                                minHeight: 0,
                                overflow: "hidden",
                                padding: "12px",
                            }}
                        >
                            {snapshot.readState.type === "error" ? (
                                <Banner tone="danger" title="Could not mark activity read">
                                    {snapshot.readState.error.message}
                                </Banner>
                            ) : null}
                            {snapshot.pageError ? (
                                <Banner tone="danger" title="More activity could not load">
                                    {snapshot.pageError.message}
                                </Banner>
                            ) : null}
                            {visible.length > 0 ? (
                                <NotificationList
                                    hasMore={Boolean(snapshot.nextCursor)}
                                    loadingMore={snapshot.pageLoading}
                                    notifications={visible}
                                    onEndReached={store.notificationsMore}
                                    onSelect={(id) => {
                                        store.notificationsRead([id]);
                                        const notification =
                                            snapshot.notifications.type === "ready"
                                                ? snapshot.notifications.value.find(
                                                      (item) => item.id === id,
                                                  )
                                                : undefined;
                                        if (notification) props.onSelect?.(notification);
                                    }}
                                    virtualize={props.virtualize ?? true}
                                />
                            ) : (
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
                            )}
                        </Box>
                    </Box>
                ) : snapshot.notifications.type === "error" ? (
                    <Banner tone="danger" title="Activity unavailable">
                        {snapshot.notifications.error.message}
                    </Banner>
                ) : (
                    <EmptyState
                        description="Mentions, replies, reactions, and system events collect here."
                        icon="bell"
                        title={
                            snapshot.notifications.type === "loading"
                                ? "Loading activity…"
                                : "No activity yet"
                        }
                    />
                );
            }}
        </StoreSurface>
    );
}
function notificationItem(
    item: NotificationProjection,
    imageUrl?: (fileId?: string) => string | undefined,
    contextLabel?: (notification: NotificationProjection) => string | undefined,
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
        context: contextLabel?.(item),
        time: formatDate(item.createdAt),
        unread: item.readAt === undefined,
    };
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
