import {
    children,
    createEffect,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    splitProps,
    type JSX,
} from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, ReactionChip } from "./Badge";
import { Button } from "./Button";
import { EmojiPicker, type EmojiItem } from "./EmojiPicker";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

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

export type MessageImage = {
    id: string;
    url: string;
    alt?: string;
    /** Intrinsic pixel dimensions — reserve a stable box before the image loads. */
    width?: number;
    height?: number;
};

const MEDIA_SINGLE_MAX_W = 380;
const MEDIA_SINGLE_MAX_H = 320;

/**
 * Inline box for a lone photo with known dimensions: an aspect-ratio plus a
 * capped width reserves the exact layout up front so nothing reflows when the
 * image finishes loading. Multi-image tiles are square via CSS and need none.
 */
function mediaItemStyle(image: MessageImage, count: number): JSX.CSSProperties | undefined {
    if (count !== 1 || !image.width || !image.height) return undefined;
    const ratio = image.width / image.height;
    const width = Math.round(Math.min(image.width, MEDIA_SINGLE_MAX_W, MEDIA_SINGLE_MAX_H * ratio));
    return { width: `${width}px`, "aspect-ratio": `${image.width} / ${image.height}` };
}

export type MessageDeliveryState = "failed" | "sending" | "sent";

export type MessageProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
    /** Keeps a backed toolbar visible without hover (controlled/blueprint state). */
    actionsVisible?: boolean;
    /** Author is an agent → accent AGENT badge next to the name. */
    agent?: boolean;
    author: string;
    body: string | MessageSegment[];
    /** Attachment cards (runs, approvals, events) rendered below the body. */
    children?: JSX.Element;
    /** Follow-up message: no avatar/author row, time sits in the gutter. */
    compact?: boolean;
    /** Delivery styling that never inserts or removes layout. */
    deliveryState?: MessageDeliveryState;
    /** Consecutive message from the same author. Preferred over `compact`. */
    grouped?: boolean;
    /** Compact time for the grouped gutter (e.g. "12:55") so a wide 12-hour
     * "12:55 AM" — fine inline on the first message — still fits the 36px gutter.
     * Defaults to `time`. */
    gutterTime?: string;
    imageUrl?: string;
    /** Inline photo attachments rendered as a clickable thumbnail grid. */
    images?: MessageImage[];
    /** Opens an image (by id) — wire to a web-modal lightbox, never a new tab. */
    onImageOpen?: (id: string) => void;
    initials?: string;
    /** Real actions for the overflow menu. No menu button renders when empty. */
    menuItems?: MenuItem[];
    onMenuSelect?: (id: string) => void;
    onReactionAdd?: () => void;
    onReactionSelect?: (emoji: string) => void;
    onReplySelect?: () => void;
    reactions?: MessageReaction[];
    /** Emoji available in the hover reaction picker. IDs are passed to `onReactionSelect`. */
    reactionOptions?: EmojiItem[];
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

function hasRenderableChild(value: JSX.Element): boolean {
    if (Array.isArray(value)) return value.some(hasRenderableChild);
    return (
        value !== undefined && value !== null && value !== false && value !== true && value !== ""
    );
}

/**
 * One chat message on the app surface: 36px avatar gutter, author/time row,
 * rich body segments, attachment slot, reactions, and reply affordance.
 */
export function Message(props: MessageProps) {
    const [local, rest] = splitProps(props, [
        "agent",
        "actionsVisible",
        "author",
        "body",
        "children",
        "class",
        "compact",
        "deliveryState",
        "grouped",
        "gutterTime",
        "imageUrl",
        "images",
        "onImageOpen",
        "initials",
        "menuItems",
        "onMenuSelect",
        "onReactionAdd",
        "onReactionSelect",
        "onReplySelect",
        "reactions",
        "reactionOptions",
        "replyCount",
        "style",
        "time",
        "tone",
    ]);
    const attachments = children(() => local.children);
    const [menuOpen, setMenuOpen] = createSignal(false);
    const [reactionOpen, setReactionOpen] = createSignal(false);
    const [reactionQuery, setReactionQuery] = createSignal("");
    const [popoverStyle, setPopoverStyle] = createSignal<JSX.CSSProperties>({});
    let root: HTMLDivElement | undefined;
    const segments = (): MessageSegment[] =>
        typeof local.body === "string" ? [{ kind: "text", text: local.body }] : local.body;
    const hasAttachments = () => hasRenderableChild(attachments());
    const grouped = () => local.grouped || local.compact;
    const deliveryState = () => local.deliveryState ?? "sent";
    const hasReactionAction = () =>
        Boolean(local.onReactionAdd) ||
        Boolean(local.onReactionSelect && local.reactionOptions?.length);
    const hasMenuAction = () =>
        Boolean(local.onMenuSelect) &&
        Boolean(local.menuItems?.some((item) => item.kind === "item"));
    const hasActions = () =>
        deliveryState() !== "sending" &&
        (hasReactionAction() || Boolean(local.onReplySelect) || hasMenuAction());
    const filteredReactionOptions = () => {
        const query = reactionQuery().trim().toLocaleLowerCase();
        if (!query) return local.reactionOptions ?? [];
        return (local.reactionOptions ?? []).filter((emoji) =>
            emoji.name.toLocaleLowerCase().includes(query),
        );
    };

    const closePopovers = () => {
        setMenuOpen(false);
        setReactionOpen(false);
    };

    const menuHeight = () =>
        12 +
        (local.menuItems ?? []).reduce((height, item) => {
            if (item.kind === "item") return height + 32;
            if (item.kind === "label") return height + 24;
            return height + 11;
        }, 0);

    const placePopover = (width: number, height: number) => {
        const bounds = root?.getBoundingClientRect();
        if (!bounds) return;
        const edge = 8;
        const left = Math.max(edge, Math.min(bounds.right - 20 - width, innerWidth - width - edge));
        const below = bounds.top + 40;
        const above = bounds.top - height - 4;
        const top =
            below + height <= innerHeight - edge
                ? below
                : above >= edge
                  ? above
                  : Math.max(edge, innerHeight - height - edge);
        setPopoverStyle({ left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
    };

    const toggleReactionPicker = () => {
        setMenuOpen(false);
        if (local.reactionOptions?.length) {
            placePopover(234, 62 + Math.ceil(local.reactionOptions.length / 6) * 36);
            setReactionOpen((open) => !open);
            setReactionQuery("");
        }
        local.onReactionAdd?.();
    };

    createEffect(() => {
        if (!menuOpen() && !reactionOpen()) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!root?.contains(event.target as Node)) {
                closePopovers();
            }
        };
        const onViewportChange = () => closePopovers();
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("scroll", onViewportChange, true);
        window.addEventListener("resize", onViewportChange);
        onCleanup(() => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("scroll", onViewportChange, true);
            window.removeEventListener("resize", onViewportChange);
        });
    });

    return (
        <div
            {...rest}
            class={["rigged-message", local.class].filter(Boolean).join(" ")}
            data-agent={local.agent ? "" : undefined}
            data-actions-visible={local.actionsVisible ? "" : undefined}
            data-compact={grouped() ? "" : undefined}
            data-delivery-state={deliveryState()}
            data-grouped={grouped() ? "" : undefined}
            data-has-actions={hasActions() ? "" : undefined}
            data-has-body={local.body ? "" : undefined}
            data-rigged-ui="message"
            aria-busy={deliveryState() === "sending" ? "true" : undefined}
            onKeyDown={(event) => {
                if (event.key === "Escape") closePopovers();
            }}
            ref={(element) => (root = element)}
            style={local.style}
        >
            <div class="rigged-message__gutter" data-rigged-ui="message-gutter">
                <Show
                    when={!grouped()}
                    fallback={
                        <span
                            class="rigged-message__gutter-time"
                            data-rigged-ui="message-gutter-time"
                        >
                            {local.gutterTime ?? local.time}
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
                <Show when={!grouped()}>
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
                <Show when={local.body}>
                    <div class="rigged-message__body" data-rigged-ui="message-body">
                        <For each={segments()}>{(segment) => renderSegment(segment)}</For>
                    </div>
                </Show>
                <Show when={local.images && local.images.length > 0}>
                    <div
                        class="rigged-message__media"
                        data-count={Math.min(local.images!.length, 4)}
                        data-rigged-ui="message-media"
                    >
                        <For each={local.images!.slice(0, 4)}>
                            {(image) => (
                                <button
                                    aria-label={image.alt ? `Open ${image.alt}` : "Open image"}
                                    class="rigged-message__media-item"
                                    data-fixed={image.width && image.height ? "" : undefined}
                                    data-media-id={image.id}
                                    data-rigged-ui="message-media-item"
                                    onClick={() => local.onImageOpen?.(image.id)}
                                    style={mediaItemStyle(image, Math.min(local.images!.length, 4))}
                                    type="button"
                                >
                                    <img
                                        alt={image.alt ?? ""}
                                        class="rigged-message__media-image"
                                        data-rigged-ui="message-media-image"
                                        draggable={false}
                                        height={image.height}
                                        loading="lazy"
                                        src={image.url}
                                        width={image.width}
                                    />
                                </button>
                            )}
                        </For>
                    </div>
                </Show>
                <Show when={hasAttachments()}>
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
                        <Show when={hasReactionAction()}>
                            <button
                                aria-expanded={reactionOpen()}
                                aria-haspopup={local.reactionOptions?.length ? "dialog" : undefined}
                                aria-label="Add reaction"
                                class="rigged-message__react-add"
                                data-rigged-ui="message-react-add"
                                onClick={toggleReactionPicker}
                                type="button"
                            >
                                <Icon name="smile" size={14} />
                            </button>
                        </Show>
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
            <Show when={hasActions()}>
                <div class="rigged-message__actions" data-rigged-ui="message-actions">
                    <Show when={hasReactionAction()}>
                        <Button
                            aria-expanded={reactionOpen()}
                            aria-haspopup={local.reactionOptions?.length ? "dialog" : undefined}
                            aria-label="Add reaction"
                            class="rigged-message__action"
                            icon="smile"
                            iconOnly
                            onClick={toggleReactionPicker}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                    <Show when={local.onReplySelect}>
                        <Button
                            aria-label={local.replyCount ? "Open thread" : "Start thread"}
                            class="rigged-message__action"
                            icon="thread"
                            iconOnly
                            onClick={() => local.onReplySelect?.()}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                    <Show when={hasMenuAction()}>
                        <Button
                            aria-expanded={menuOpen()}
                            aria-haspopup="menu"
                            aria-label="More message actions"
                            class="rigged-message__action"
                            icon="more"
                            iconOnly
                            onClick={() => {
                                setReactionOpen(false);
                                placePopover(196, menuHeight());
                                setMenuOpen((open) => !open);
                            }}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                </div>
                <Show when={reactionOpen() && local.reactionOptions?.length}>
                    <div
                        class="rigged-message__popover rigged-message__popover--reaction"
                        data-rigged-ui="message-reaction-popover"
                        style={popoverStyle()}
                    >
                        <EmojiPicker
                            columns={6}
                            emoji={filteredReactionOptions()}
                            onQueryChange={setReactionQuery}
                            onSelect={(id) => {
                                local.onReactionSelect?.(id);
                                closePopovers();
                            }}
                            query={reactionQuery()}
                        />
                    </div>
                </Show>
                <Show when={menuOpen() && local.menuItems}>
                    {(items) => (
                        <div
                            class="rigged-message__popover rigged-message__popover--menu"
                            data-rigged-ui="message-menu-popover"
                            style={popoverStyle()}
                        >
                            <Menu
                                items={items()}
                                onSelect={(id) => {
                                    local.onMenuSelect?.(id);
                                    closePopovers();
                                }}
                                width={196}
                            />
                        </div>
                    )}
                </Show>
            </Show>
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
