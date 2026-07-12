import { children, For, onCleanup, onMount, Show, splitProps, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, ReactionChip } from "./Badge";
import { Icon } from "./Icon";

export type MessageSegment =
    | { kind: "text"; text: string }
    | { kind: "mention"; text: string }
    | { kind: "code"; text: string }
    | { kind: "link"; text: string };

export type MessageReaction = {
    active?: boolean;
    count: number;
    emoji: string;
};

export type MessageProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
    /** Author is an agent → accent AGENT badge next to the name. */
    agent?: boolean;
    author: string;
    body: string | MessageSegment[];
    /** Attachment cards (runs, approvals, events) rendered below the body. */
    children?: JSX.Element;
    /** Follow-up message: no avatar/author row, time sits in the gutter. */
    compact?: boolean;
    imageUrl?: string;
    initials?: string;
    onReactionAdd?: () => void;
    onReactionSelect?: (emoji: string) => void;
    onReplySelect?: () => void;
    reactions?: MessageReaction[];
    replyCount?: number;
    style?: JSX.CSSProperties;
    time: string;
    tone?: ToneName;
};

function deriveInitials(author: string) {
    return author
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0] ?? "")
        .join("")
        .toUpperCase();
}

function renderSegment(segment: MessageSegment): JSX.Element {
    switch (segment.kind) {
        case "mention":
            return (
                <span class="rigged-message__mention" data-rigged-ui="message-mention">
                    @{segment.text}
                </span>
            );
        case "code":
            return (
                <code class="rigged-message__code" data-rigged-ui="message-code">
                    {segment.text}
                </code>
            );
        case "link":
            return (
                <a class="rigged-message__link" data-rigged-ui="message-link">
                    {segment.text}
                </a>
            );
        default:
            return segment.text;
    }
}

/**
 * One chat message on the app surface: 36px avatar gutter, author/time row,
 * rich body segments, attachment slot, reactions, and reply affordance.
 */
export function Message(props: MessageProps) {
    const [local, rest] = splitProps(props, [
        "agent",
        "author",
        "body",
        "children",
        "class",
        "compact",
        "imageUrl",
        "initials",
        "onReactionAdd",
        "onReactionSelect",
        "onReplySelect",
        "reactions",
        "replyCount",
        "style",
        "time",
        "tone",
    ]);
    const attachments = children(() => local.children);
    const segments = (): MessageSegment[] =>
        typeof local.body === "string" ? [{ kind: "text", text: local.body }] : local.body;

    return (
        <div
            {...rest}
            class={["rigged-message", local.class].filter(Boolean).join(" ")}
            data-agent={local.agent ? "" : undefined}
            data-compact={local.compact ? "" : undefined}
            data-rigged-ui="message"
            style={local.style}
        >
            <div class="rigged-message__gutter" data-rigged-ui="message-gutter">
                <Show
                    when={!local.compact}
                    fallback={
                        <span
                            class="rigged-message__gutter-time"
                            data-rigged-ui="message-gutter-time"
                        >
                            {local.time}
                        </span>
                    }
                >
                    <Avatar
                        imageUrl={local.imageUrl}
                        initials={local.initials ?? deriveInitials(local.author)}
                        size="md"
                        tone={local.tone}
                        type={local.agent ? "agent" : "human"}
                    />
                </Show>
            </div>
            <div class="rigged-message__content" data-rigged-ui="message-content">
                <Show when={!local.compact}>
                    <div class="rigged-message__meta" data-rigged-ui="message-meta">
                        <span class="rigged-message__author" data-rigged-ui="message-author">
                            {local.author}
                        </span>
                        <Show when={local.agent}>
                            <Badge label="AGENT" variant="accent" />
                        </Show>
                        <span class="rigged-message__time" data-rigged-ui="message-time">
                            {local.time}
                        </span>
                    </div>
                </Show>
                <div class="rigged-message__body" data-rigged-ui="message-body">
                    <For each={segments()}>{(segment) => renderSegment(segment)}</For>
                </div>
                <Show when={attachments()}>
                    <div class="rigged-message__attachments" data-rigged-ui="message-attachments">
                        {attachments()}
                    </div>
                </Show>
                <Show when={local.reactions && local.reactions.length > 0}>
                    <div class="rigged-message__reactions" data-rigged-ui="message-reactions">
                        <For each={local.reactions}>
                            {(reaction) => (
                                <ReactionChip
                                    active={reaction.active}
                                    count={reaction.count}
                                    emoji={reaction.emoji}
                                    onSelect={() => local.onReactionSelect?.(reaction.emoji)}
                                />
                            )}
                        </For>
                        <button
                            aria-label="Add reaction"
                            class="rigged-message__react-add"
                            data-rigged-ui="message-react-add"
                            onClick={() => local.onReactionAdd?.()}
                            type="button"
                        >
                            <Icon name="smile" size={14} />
                        </button>
                    </div>
                </Show>
                <Show when={local.replyCount}>
                    {(count) => (
                        <button
                            class="rigged-message__replies"
                            data-rigged-ui="message-replies"
                            onClick={() => local.onReplySelect?.()}
                            type="button"
                        >
                            {count()} {count() === 1 ? "reply" : "replies"}
                        </button>
                    )}
                </Show>
            </div>
        </div>
    );
}

export type MessageListProps = {
    children: JSX.Element;
    class?: string;
    intro?: { description: string; title: string };
    style?: JSX.CSSProperties;
};

/** A reader this close to the bottom (px) still follows appended content. */
const FOLLOW_BOTTOM_THRESHOLD = 8;

/**
 * Scrolling message column. A `margin-top: auto` spacer bottom-anchors sparse
 * histories while long histories scroll chronologically from the top.
 *
 * Follows the newest content: scrolls to the bottom instantly on mount and
 * whenever its content grows — unless the user has scrolled up, in which case
 * their position is preserved (standard chat behavior). The "was at/near the
 * bottom before the mutation" flag is tracked from scroll events, so it always
 * reflects the position prior to the DOM change.
 */
export function MessageList(props: MessageListProps) {
    let list: HTMLDivElement | undefined;
    let following = true;

    const scrollToBottom = () => {
        if (list) list.scrollTop = list.scrollHeight - list.clientHeight;
    };

    onMount(() => {
        const element = list;
        if (!element) return;
        scrollToBottom();
        const onScroll = () => {
            following =
                element.scrollHeight - element.scrollTop - element.clientHeight <=
                FOLLOW_BOTTOM_THRESHOLD;
        };
        element.addEventListener("scroll", onScroll, { passive: true });
        const observer = new MutationObserver(() => {
            if (following) scrollToBottom();
        });
        observer.observe(element, { characterData: true, childList: true, subtree: true });
        onCleanup(() => {
            observer.disconnect();
            element.removeEventListener("scroll", onScroll);
        });
    });

    return (
        <div
            class={["rigged-message-list", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="message-list"
            ref={(element) => (list = element)}
            style={props.style}
        >
            <div
                aria-hidden="true"
                class="rigged-message-list__spacer"
                data-rigged-ui="message-list-spacer"
            />
            <Show when={props.intro}>
                {(intro) => (
                    <header class="rigged-message-list__intro" data-rigged-ui="message-list-intro">
                        <h2
                            class="rigged-message-list__intro-title"
                            data-rigged-ui="message-list-intro-title"
                        >
                            {intro().title}
                        </h2>
                        <p
                            class="rigged-message-list__intro-description"
                            data-rigged-ui="message-list-intro-description"
                        >
                            {intro().description}
                        </p>
                    </header>
                )}
            </Show>
            {props.children}
        </div>
    );
}

/** Centered mono date pill over a hairline, separating message days. */
export function DayDivider(props: { class?: string; label: string }) {
    return (
        <div
            aria-label={props.label}
            class={["rigged-day-divider", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="day-divider"
            role="separator"
        >
            <span
                aria-hidden="true"
                class="rigged-day-divider__line"
                data-rigged-ui="day-divider-line"
            />
            <span class="rigged-day-divider__label" data-rigged-ui="day-divider-label">
                {props.label}
            </span>
            <span
                aria-hidden="true"
                class="rigged-day-divider__line"
                data-rigged-ui="day-divider-line"
            />
        </div>
    );
}
