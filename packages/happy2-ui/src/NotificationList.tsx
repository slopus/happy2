import { For, Show, splitProps, type JSX } from "solid-js";
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
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    notifications: NotificationItem[];
    onSelect?: (id: string) => void;
    emptyLabel?: string;
};

type KindTone = "accent" | "info" | "success" | "warning" | "danger" | "neutral";
type KindMeta = { icon: IconName; label: string; tone: KindTone };

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

function renderSegment(segment: MessageSegment): JSX.Element {
    switch (segment.kind) {
        case "mention":
            return (
                <span
                    class="happy2-notification-row__mention"
                    data-happy2-ui="notification-mention"
                >
                    @{segment.text}
                </span>
            );
        case "code":
            return (
                <code class="happy2-notification-row__code" data-happy2-ui="notification-code">
                    {segment.text}
                </code>
            );
        case "link":
            return (
                <a class="happy2-notification-row__link" data-happy2-ui="notification-link">
                    {segment.text}
                </a>
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
            class="happy2-notification-row"
            data-item-id={item().id}
            data-kind={item().kind}
            data-happy2-ui="notification-row"
            data-unread={item().unread ? "" : undefined}
            onClick={() => props.onSelect?.(item().id)}
            type="button"
        >
            <span
                aria-hidden="true"
                class="happy2-notification-row__unread-lane"
                data-happy2-ui="notification-unread-lane"
            >
                <Show when={item().unread}>
                    <span
                        class="happy2-notification-row__unread"
                        data-happy2-ui="notification-unread"
                    />
                </Show>
            </span>
            <span class="happy2-notification-row__media" data-happy2-ui="notification-media">
                <Show
                    when={item().actor}
                    fallback={
                        <span
                            aria-label={meta().label}
                            class="happy2-notification-row__kind"
                            data-happy2-ui="notification-kind"
                            data-tone={meta().tone}
                            data-variant="tile"
                            role="img"
                        >
                            <Icon name={meta().icon} size={16} />
                        </span>
                    }
                >
                    {(actor) => (
                        <>
                            <Avatar
                                imageUrl={actor().imageUrl}
                                initials={actor().initials}
                                size="md"
                                tone={actor().tone}
                            />
                            <span
                                aria-label={meta().label}
                                class="happy2-notification-row__kind"
                                data-happy2-ui="notification-kind"
                                data-tone={meta().tone}
                                data-variant="corner"
                                role="img"
                            >
                                <Icon name={meta().icon} size={12} />
                            </span>
                        </>
                    )}
                </Show>
            </span>
            <span class="happy2-notification-row__body" data-happy2-ui="notification-body">
                <span class="happy2-notification-row__text" data-happy2-ui="notification-text">
                    <Show when={item().actor}>
                        {(actor) => (
                            <>
                                <span
                                    class="happy2-notification-row__actor"
                                    data-happy2-ui="notification-actor"
                                >
                                    {actor().name}
                                </span>{" "}
                            </>
                        )}
                    </Show>
                    <For each={segments()}>{(segment) => renderSegment(segment)}</For>
                </span>
                <Show when={item().context}>
                    <span
                        class="happy2-notification-row__context"
                        data-happy2-ui="notification-context"
                    >
                        {item().context}
                    </span>
                </Show>
            </span>
            <span class="happy2-notification-row__time" data-happy2-ui="notification-time">
                {item().time}
            </span>
        </button>
    );
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
    const [local, rest] = splitProps(props, [
        "class",
        "emptyLabel",
        "notifications",
        "onSelect",
        "style",
    ]);

    return (
        <div
            {...rest}
            class={["happy2-notification-list", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="notification-list"
            style={local.style}
        >
            <Show
                when={local.notifications.length > 0}
                fallback={
                    <div
                        class="happy2-notification-list__empty"
                        data-happy2-ui="notification-list-empty"
                    >
                        {local.emptyLabel ?? "You're all caught up"}
                    </div>
                }
            >
                <For each={local.notifications}>
                    {(item) => <NotificationRow item={item} onSelect={local.onSelect} />}
                </For>
            </Show>
        </div>
    );
}
