import { createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
    Box,
    Button,
    EmptyState,
    NotificationList,
    type NotificationItem,
    SegmentedControl,
    Toolbar,
} from "rigged-ui";
import { featureEmptyStates } from "../mockData";

export type InboxViewProps = {
    notifications: NotificationItem[];
    onSelect?: (id: string) => void;
    onMarkRead?: (id: string) => void;
};

type InboxFilter = "all" | "unread";

/**
 * Activity feature area — a full NotificationList with unread + mark-read
 * affordances. A Toolbar header carries the unread summary, an All/Unread
 * SegmentedControl filter, and a "Mark all read" action; selecting a row marks
 * it read. Empty inbox and fully-read filter states render as EmptyState.
 *
 * Notifications are not yet served by `server.ts`, so read state is owned
 * locally over the representative mock data. // TODO(server): live activity feed
 */
export function InboxView(props: InboxViewProps) {
    const [items, setItems] = createStore<NotificationItem[]>(
        props.notifications.map((notification) => ({ ...notification })),
    );
    const [filter, setFilter] = createSignal<InboxFilter>("all");

    const activityEmpty = featureEmptyStates["activity"]!;

    const unreadCount = () => items.filter((notification) => notification.unread).length;
    const visible = () =>
        filter() === "unread" ? items.filter((notification) => notification.unread) : items.slice();

    const summary = () => {
        const unread = unreadCount();
        if (items.length === 0) return "No notifications";
        if (unread === 0) return `All ${items.length} read`;
        return `${unread} unread · ${items.length} total`;
    };

    const markRead = (id: string) => {
        const index = items.findIndex((notification) => notification.id === id);
        if (index >= 0) setItems(index, "unread", false);
    };

    const handleSelect = (id: string) => {
        markRead(id);
        props.onMarkRead?.(id);
        props.onSelect?.(id);
    };

    const markAllRead = () => {
        items.forEach((notification, index) => {
            if (notification.unread) {
                props.onMarkRead?.(notification.id);
                setItems(index, "unread", false);
            }
        });
    };

    return (
        <Show
            when={items.length > 0}
            fallback={
                <EmptyState
                    description={activityEmpty.description}
                    icon={activityEmpty.icon}
                    title={activityEmpty.title}
                />
            }
        >
            <Box
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    flex: "1 1 0%",
                    "min-height": 0,
                }}
            >
                <Toolbar
                    subtitle={summary()}
                    title="Activity"
                    trailing={
                        <>
                            <SegmentedControl
                                onChange={(value) => setFilter(value as InboxFilter)}
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
                                onClick={markAllRead}
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
                        <NotificationList notifications={visible()} onSelect={handleSelect} />
                    </Show>
                </Box>
            </Box>
        </Show>
    );
}
