import { partitionComponentProps } from "./componentProps";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type CSSProperties, type ReactNode, type UIEvent } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import type { MessageSegment } from "./Message";
export type NotificationKind =
    | "mention"
    | "thread_reply"
    | "direct_message"
    | "reaction"
    | "call"
    | "system"
    | "moderation"
    | "automation";
export type NotificationActor = {
    name: string;
    initials: string;
    tone?: ToneName;
    imageUrl?: string;
};
export type NotificationItem = {
    id: string;
    kind: NotificationKind;
    actor?: NotificationActor;
    text: string | MessageSegment[];
    context?: string;
    time: string;
    unread?: boolean;
};
export type NotificationListProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    notifications: NotificationItem[];
    onSelect?: (id: string) => void;
    emptyLabel?: string;
    hasMore?: boolean;
    loadingMore?: boolean;
    onEndReached?: () => void;
    virtualize?: boolean;
};
type KindTone = "accent" | "info" | "success" | "warning" | "danger" | "neutral";
type KindMeta = {
    icon: IconName;
    label: string;
    tone: KindTone;
};
/*
 * Each notification kind maps to a leading glyph and a semantic tone. The tone
 * only selects theme tokens (--nl-kind-color / --nl-kind-soft in the CSS); the
 * component never emits a raw colour.
 */
const kindMeta: Record<NotificationKind, KindMeta> = {
    mention: { icon: "at", label: "Mention", tone: "accent" },
    thread_reply: { icon: "thread", label: "Thread reply", tone: "info" },
    direct_message: { icon: "chat", label: "Direct message", tone: "success" },
    reaction: { icon: "smile", label: "Reaction", tone: "warning" },
    call: { icon: "mic", label: "Call", tone: "success" },
    system: { icon: "bell", label: "System", tone: "neutral" },
    moderation: { icon: "shield", label: "Moderation", tone: "danger" },
    automation: { icon: "zap", label: "Automation", tone: "warning" },
};
function renderSegment(segment: MessageSegment): ReactNode {
    switch (segment.kind) {
        case "mention":
            return (
                <span
                    className="happy2-notification-row__mention"
                    data-happy2-ui="notification-mention"
                >
                    @{segment.text}
                </span>
            );
        case "code":
            return (
                <code className="happy2-notification-row__code" data-happy2-ui="notification-code">
                    {segment.text}
                </code>
            );
        case "link":
            return (
                <span className="happy2-notification-row__link" data-happy2-ui="notification-link">
                    {segment.text}
                </span>
            );
        default:
            return segment.text;
    }
}
function NotificationRow(props: { item: NotificationItem; onSelect?: (id: string) => void }) {
    const item = () => props.item;
    const meta = () => kindMeta[item().kind];
    const segments = (): MessageSegment[] =>
        typeof item().text === "string"
            ? [{ kind: "text", text: item().text as string }]
            : (item().text as MessageSegment[]);
    return (
        <button
            aria-label={notificationLabel(item())}
            className="happy2-notification-row"
            data-item-id={item().id}
            data-kind={item().kind}
            data-happy2-ui="notification-row"
            data-unread={item().unread ? "" : undefined}
            onClick={() => props.onSelect?.(item().id)}
            type="button"
        >
            <span
                aria-hidden="true"
                className="happy2-notification-row__unread-lane"
                data-happy2-ui="notification-unread-lane"
            >
                {item().unread ? (
                    <span
                        className="happy2-notification-row__unread"
                        data-happy2-ui="notification-unread"
                    />
                ) : null}
            </span>
            <span className="happy2-notification-row__media" data-happy2-ui="notification-media">
                {item().actor ? (
                    ((actor) => (
                        <>
                            <Avatar
                                imageUrl={actor.imageUrl}
                                initials={actor.initials}
                                size="md"
                                tone={actor.tone}
                            />
                            <span
                                aria-label={meta().label}
                                className="happy2-notification-row__kind"
                                data-happy2-ui="notification-kind"
                                data-tone={meta().tone}
                                data-variant="corner"
                                role="img"
                            >
                                <Icon name={meta().icon} size={12} />
                            </span>
                        </>
                    ))(item().actor!)
                ) : (
                    <span
                        aria-label={meta().label}
                        className="happy2-notification-row__kind"
                        data-happy2-ui="notification-kind"
                        data-tone={meta().tone}
                        data-variant="tile"
                        role="img"
                    >
                        <Icon name={meta().icon} size={16} />
                    </span>
                )}
            </span>
            <span className="happy2-notification-row__body" data-happy2-ui="notification-body">
                <span className="happy2-notification-row__text" data-happy2-ui="notification-text">
                    {item().actor
                        ? ((actor) => (
                              <>
                                  <span
                                      className="happy2-notification-row__actor"
                                      data-happy2-ui="notification-actor"
                                  >
                                      {actor.name}
                                  </span>{" "}
                              </>
                          ))(item().actor!)
                        : null}
                    {segments().map((segment, index) => (
                        <span key={index}>{renderSegment(segment)}</span>
                    ))}
                </span>
                {item().context ? (
                    <span
                        className="happy2-notification-row__context"
                        data-happy2-ui="notification-context"
                    >
                        {item().context}
                    </span>
                ) : null}
            </span>
            <span className="happy2-notification-row__time" data-happy2-ui="notification-time">
                {item().time}
            </span>
        </button>
    );
}

function notificationLabel(item: NotificationItem): string {
    const text =
        typeof item.text === "string"
            ? item.text
            : item.text.map((segment) => segment.text).join("");
    return [item.actor?.name, text, item.context, item.time, item.unread ? "Unread" : undefined]
        .filter(Boolean)
        .join(" · ");
}
/**
 * C-035 NotificationList — the activity inbox. A surface card of fixed 64px
 * rows: an unread dot lane, the actor's 36px avatar carrying a per-kind corner
 * glyph badge (or a standalone tinted kind tile when a notification has no
 * actor), the notification text with an optional muted context line, and a
 * right-aligned timestamp. Read vs unread is a background token plus a leading
 * accent dot and heavier text.
 */
export function NotificationList(props: NotificationListProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "emptyLabel",
        "hasMore",
        "loadingMore",
        "notifications",
        "onEndReached",
        "onSelect",
        "style",
        "virtualize",
    ]);
    const scrollElement = useRef<HTMLDivElement>(null);
    const virtualized = local.virtualize === true;
    // TanStack Virtual deliberately owns mutable measurement functions. Keep
    // this leaf outside compiler memoization while the row components remain
    // normal compiler-eligible React children.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: virtualized ? local.notifications.length : 0,
        estimateSize: () => 64,
        getItemKey: (index) => local.notifications[index]?.id ?? index,
        getScrollElement: () => scrollElement.current,
        initialRect: { width: 0, height: 640 },
        overscan: 8,
        useFlushSync: false,
    });
    const endMaybe = (event: UIEvent<HTMLDivElement>) => {
        if (!local.hasMore || local.loadingMore) return;
        const element = event.currentTarget;
        if (element.scrollHeight - element.scrollTop - element.clientHeight <= 128)
            local.onEndReached?.();
    };
    return (
        <div
            {...rest}
            className={["happy2-notification-list", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="notification-list"
            data-virtualized={virtualized ? "" : undefined}
            onScroll={virtualized ? endMaybe : undefined}
            ref={scrollElement}
            style={local.style}
        >
            {local.notifications.length > 0 ? (
                virtualized ? (
                    <div
                        className="happy2-notification-list__virtual"
                        data-happy2-ui="notification-list-virtual"
                        style={{ height: `${virtualizer.getTotalSize()}px` }}
                    >
                        {virtualizer.getVirtualItems().map((virtualItem) => {
                            const item = local.notifications[virtualItem.index];
                            return item ? (
                                <div
                                    className="happy2-notification-list__virtual-row"
                                    data-index={virtualItem.index}
                                    key={virtualItem.key}
                                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                                >
                                    <NotificationRow item={item} onSelect={local.onSelect} />
                                </div>
                            ) : null;
                        })}
                    </div>
                ) : (
                    local.notifications.map((item) => (
                        <NotificationRow key={item.id} item={item} onSelect={local.onSelect} />
                    ))
                )
            ) : (
                <div
                    className="happy2-notification-list__empty"
                    data-happy2-ui="notification-list-empty"
                >
                    {local.emptyLabel ?? "You're all caught up"}
                </div>
            )}
            {local.loadingMore ? (
                <div
                    className="happy2-notification-list__loading"
                    data-happy2-ui="notification-list-loading"
                    role="status"
                >
                    Loading more activity…
                </div>
            ) : null}
        </div>
    );
}
