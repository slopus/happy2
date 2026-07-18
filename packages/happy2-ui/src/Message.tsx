import { partitionComponentProps } from "./componentProps";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    Children,
    isValidElement,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, ReactionChip } from "./Badge";
import { Button } from "./Button";
import { EmojiPicker, type EmojiItem } from "./EmojiPicker";
import { Icon, type IconName } from "./Icon";
import { renderMessageMarkdown, type MessageGenerationStatus } from "./MessageMarkdown";
import { Menu, type MenuItem } from "./Menu";
export type MessageSegment =
    | {
          kind: "text";
          text: string;
      }
    | {
          kind: "mention";
          text: string;
      }
    | {
          kind: "code";
          text: string;
      }
    | {
          kind: "link";
          text: string;
      };
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
function mediaItemStyle(image: MessageImage, count: number): CSSProperties | undefined {
    if (count !== 1 || !image.width || !image.height) return undefined;
    const ratio = image.width / image.height;
    const width = Math.round(Math.min(image.width, MEDIA_SINGLE_MAX_W, MEDIA_SINGLE_MAX_H * ratio));
    return { width: `${width}px`, aspectRatio: `${image.width} / ${image.height}` };
}
export type MessageDeliveryState = "failed" | "sending" | "sent";
export type MessageProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    /** Keeps a backed toolbar visible without hover (controlled/blueprint state). */
    actionsVisible?: boolean;
    /** Author is an agent → accent AGENT badge next to the name. */
    agent?: boolean;
    author: string;
    body: string | MessageSegment[];
    /** Attachment cards (runs, approvals, events) rendered below the body. */
    children?: ReactNode;
    /** Follow-up message: no avatar/author row, time sits in the gutter. */
    compact?: boolean;
    /** Delivery styling that never inserts or removes layout. */
    deliveryState?: MessageDeliveryState;
    /** Agent reply generation lifecycle for a string body. Separate from
     * `deliveryState`: delivery is outgoing, generation is the incoming reply
     * being produced. `streaming` shows a live caret; `failed` a minimal marker. */
    generationStatus?: MessageGenerationStatus;
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
    /** Makes the avatar and author name clickable to open the author's profile.
     *  Only the leading message of a group renders an avatar/name, so grouped
     *  follow-ups intentionally carry no profile affordance. */
    onAuthorSelect?: () => void;
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
    style?: CSSProperties;
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
function renderSegment(segment: MessageSegment): ReactNode {
    switch (segment.kind) {
        case "mention":
            return (
                <span className="happy2-message__mention" data-happy2-ui="message-mention">
                    @{segment.text}
                </span>
            );
        case "code":
            return (
                <code className="happy2-message__code" data-happy2-ui="message-code">
                    {segment.text}
                </code>
            );
        case "link":
            return (
                <span className="happy2-message__link" data-happy2-ui="message-link">
                    {segment.text}
                </span>
            );
        default:
            return segment.text;
    }
}
function hasRenderableChild(value: ReactNode): boolean {
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
    const [local, rest] = partitionComponentProps(props, [
        "agent",
        "actionsVisible",
        "author",
        "body",
        "children",
        "className",
        "compact",
        "deliveryState",
        "generationStatus",
        "grouped",
        "gutterTime",
        "imageUrl",
        "images",
        "onImageOpen",
        "initials",
        "menuItems",
        "onAuthorSelect",
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
    const attachments = local.children;
    const [menuOpen, setMenuOpen] = useState(false);
    const [reactionOpen, setReactionOpen] = useState(false);
    const [reactionQuery, setReactionQuery] = useState("");
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
    const root = useRef<HTMLDivElement>(null);
    const segments = (): MessageSegment[] =>
        typeof local.body === "string" ? [{ kind: "text", text: local.body }] : local.body;
    const isMarkdownBody = () => typeof local.body === "string";
    /* A string body renders as Markdown; recompiles only when the streamed text
       changes, so an in-place stream tick reuses the surrounding row and swaps
       just the body nodes. Generation status drives the caret/marker below, not
       the Markdown output. */
    const markdownBody = typeof local.body === "string" ? renderMessageMarkdown(local.body) : null;
    const hasAttachments = () => hasRenderableChild(attachments);
    const grouped = () => local.grouped || local.compact;
    const authorActionLabel = () => `View ${local.author}’s profile`;
    const renderAvatar = () => (
        <Avatar
            imageUrl={local.imageUrl}
            initials={local.initials ?? deriveInitials(local.author)}
            size="md"
            tone={local.tone}
            type={local.agent ? "agent" : "human"}
        />
    );
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
        const query = reactionQuery.trim().toLocaleLowerCase();
        if (!query) return local.reactionOptions ?? [];
        return (local.reactionOptions ?? []).filter((emoji) =>
            emoji.name.toLocaleLowerCase().includes(query),
        );
    };
    const menuOpenSet = (open: boolean) => {
        setMenuOpen(open);
    };
    const reactionOpenSet = (open: boolean) => {
        setReactionOpen(open);
    };
    const closePopovers = useCallback(() => {
        menuOpenSet(false);
        reactionOpenSet(false);
    }, []);
    const menuHeight = () =>
        12 +
        (local.menuItems ?? []).reduce((height, item) => {
            if (item.kind === "item") return height + 32;
            if (item.kind === "label") return height + 24;
            return height + 11;
        }, 0);
    const placePopover = (width: number, height: number) => {
        const bounds = root.current?.getBoundingClientRect();
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
        menuOpenSet(false);
        if (local.reactionOptions?.length) {
            placePopover(234, 62 + Math.ceil(local.reactionOptions.length / 6) * 36);
            setReactionOpen((open) => !open);
            setReactionQuery("");
        }
        local.onReactionAdd?.();
    };
    useLayoutEffect(() => {
        if (!menuOpen && !reactionOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                closePopovers();
            }
        };
        const onViewportChange = () => {
            closePopovers();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("scroll", onViewportChange, true);
        window.addEventListener("resize", onViewportChange);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("scroll", onViewportChange, true);
            window.removeEventListener("resize", onViewportChange);
        };
    }, [closePopovers, menuOpen, reactionOpen]);
    return (
        <div
            {...rest}
            className={["happy2-message", local.className].filter(Boolean).join(" ")}
            data-agent={local.agent ? "" : undefined}
            data-actions-visible={local.actionsVisible ? "" : undefined}
            data-compact={grouped() ? "" : undefined}
            data-delivery-state={deliveryState()}
            data-generation-status={local.generationStatus}
            data-grouped={grouped() ? "" : undefined}
            data-has-actions={hasActions() ? "" : undefined}
            data-has-body={local.body ? "" : undefined}
            data-happy2-ui="message"
            aria-busy={
                deliveryState() === "sending" || local.generationStatus === "streaming"
                    ? "true"
                    : undefined
            }
            onKeyDown={(event) => {
                if (event.key === "Escape") closePopovers();
            }}
            ref={root}
            style={local.style}
        >
            <div className="happy2-message__gutter" data-happy2-ui="message-gutter">
                {!grouped() ? (
                    local.onAuthorSelect ? (
                        <button
                            aria-label={authorActionLabel()}
                            className="happy2-message__identity"
                            data-happy2-ui="message-identity"
                            onClick={() => local.onAuthorSelect?.()}
                            type="button"
                        >
                            {renderAvatar()}
                        </button>
                    ) : (
                        renderAvatar()
                    )
                ) : (
                    <span
                        className="happy2-message__gutter-time"
                        data-happy2-ui="message-gutter-time"
                    >
                        {local.gutterTime ?? local.time}
                    </span>
                )}
            </div>
            <div className="happy2-message__content" data-happy2-ui="message-content">
                {!grouped() ? (
                    <div className="happy2-message__meta" data-happy2-ui="message-meta">
                        {local.onAuthorSelect ? (
                            <button
                                aria-label={authorActionLabel()}
                                className="happy2-message__author happy2-message__author--button"
                                data-happy2-ui="message-author"
                                onClick={() => local.onAuthorSelect?.()}
                                type="button"
                            >
                                {local.author}
                            </button>
                        ) : (
                            <span
                                className="happy2-message__author"
                                data-happy2-ui="message-author"
                            >
                                {local.author}
                            </span>
                        )}
                        {local.agent ? <Badge label="AGENT" variant="accent" /> : null}
                        <span className="happy2-message__time" data-happy2-ui="message-time">
                            {local.time}
                        </span>
                    </div>
                ) : null}
                {local.body ? (
                    isMarkdownBody() ? (
                        <div
                            className="happy2-message__body happy2-message__body--markdown"
                            data-markdown=""
                            data-happy2-ui="message-body"
                        >
                            {markdownBody}
                            {local.generationStatus === "streaming" ? (
                                <span
                                    aria-hidden="true"
                                    className="happy2-message__caret"
                                    data-happy2-ui="message-stream-caret"
                                />
                            ) : null}
                            {local.generationStatus === "failed" ? (
                                <span
                                    aria-label="Generation failed"
                                    className="happy2-message__gen-failed"
                                    data-happy2-ui="message-generation-failed"
                                    role="img"
                                />
                            ) : null}
                        </div>
                    ) : (
                        <div className="happy2-message__body" data-happy2-ui="message-body">
                            {segments().map((segment, index) => (
                                <span key={`${segment.kind}-${index}`}>
                                    {renderSegment(segment)}
                                </span>
                            ))}
                        </div>
                    )
                ) : null}
                {local.images && local.images.length > 0 ? (
                    <div
                        className="happy2-message__media"
                        data-count={Math.min(local.images!.length, 4)}
                        data-happy2-ui="message-media"
                    >
                        {local.images!.slice(0, 4).map((image) => (
                            <button
                                aria-label={image.alt ? `Open ${image.alt}` : "Open image"}
                                className="happy2-message__media-item"
                                data-fixed={image.width && image.height ? "" : undefined}
                                data-media-id={image.id}
                                data-happy2-ui="message-media-item"
                                onClick={() => local.onImageOpen?.(image.id)}
                                style={mediaItemStyle(image, Math.min(local.images!.length, 4))}
                                type="button"
                                key={image.id}
                            >
                                <img
                                    alt={image.alt ?? ""}
                                    className="happy2-message__media-image"
                                    data-happy2-ui="message-media-image"
                                    draggable={false}
                                    height={image.height}
                                    loading="lazy"
                                    src={image.url}
                                    width={image.width}
                                />
                            </button>
                        ))}
                    </div>
                ) : null}
                {hasAttachments() ? (
                    <div
                        className="happy2-message__attachments"
                        data-happy2-ui="message-attachments"
                    >
                        {attachments}
                    </div>
                ) : null}
                {local.reactions && local.reactions.length > 0 ? (
                    <div className="happy2-message__reactions" data-happy2-ui="message-reactions">
                        {local.reactions.map((reaction, index) => (
                            <ReactionChip
                                active={reaction.active}
                                count={reaction.count}
                                emoji={reaction.emoji}
                                onSelect={() => local.onReactionSelect?.(reaction.emoji)}
                                key={`${reaction.emoji}-${index}`}
                            />
                        ))}
                        {hasReactionAction() ? (
                            <button
                                aria-expanded={reactionOpen}
                                aria-haspopup={local.reactionOptions?.length ? "dialog" : undefined}
                                aria-label="Add reaction"
                                className="happy2-message__react-add"
                                data-happy2-ui="message-react-add"
                                onClick={toggleReactionPicker}
                                type="button"
                            >
                                <Icon name="smile" size={14} />
                            </button>
                        ) : null}
                    </div>
                ) : null}
                {local.replyCount
                    ? ((count) => (
                          <button
                              className="happy2-message__replies"
                              data-happy2-ui="message-replies"
                              onClick={() => local.onReplySelect?.()}
                              type="button"
                          >
                              {count} {count === 1 ? "reply" : "replies"}
                          </button>
                      ))(local.replyCount)
                    : null}
            </div>
            {hasActions() ? (
                <>
                    <div className="happy2-message__actions" data-happy2-ui="message-actions">
                        {hasReactionAction() ? (
                            <Button
                                aria-expanded={reactionOpen}
                                aria-haspopup={local.reactionOptions?.length ? "dialog" : undefined}
                                aria-label="Add reaction"
                                className="happy2-message__action"
                                icon="smile"
                                iconOnly
                                onClick={toggleReactionPicker}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {local.onReplySelect ? (
                            <Button
                                aria-label={local.replyCount ? "Open thread" : "Start thread"}
                                className="happy2-message__action"
                                icon="thread"
                                iconOnly
                                onClick={() => local.onReplySelect?.()}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {hasMenuAction() ? (
                            <Button
                                aria-expanded={menuOpen}
                                aria-haspopup="menu"
                                aria-label="More message actions"
                                className="happy2-message__action"
                                icon="more"
                                iconOnly
                                onClick={() => {
                                    reactionOpenSet(false);
                                    placePopover(196, menuHeight());
                                    menuOpenSet(!menuOpen);
                                }}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                    </div>
                    {reactionOpen && local.reactionOptions?.length ? (
                        <div
                            className="happy2-message__popover happy2-message__popover--reaction"
                            data-happy2-ui="message-reaction-popover"
                            style={popoverStyle}
                        >
                            <EmojiPicker
                                columns={6}
                                emoji={filteredReactionOptions()}
                                onQueryChange={setReactionQuery}
                                onSelect={(id) => {
                                    local.onReactionSelect?.(id);
                                    closePopovers();
                                }}
                                query={reactionQuery}
                            />
                        </div>
                    ) : null}
                    {menuOpen && local.menuItems
                        ? ((items) => (
                              <div
                                  className="happy2-message__popover happy2-message__popover--menu"
                                  data-happy2-ui="message-menu-popover"
                                  style={popoverStyle}
                              >
                                  <Menu
                                      items={items}
                                      onSelect={(id) => {
                                          local.onMenuSelect?.(id);
                                          closePopovers();
                                      }}
                                      width={196}
                                  />
                              </div>
                          ))(menuOpen && local.menuItems)
                        : null}
                </>
            ) : null}
        </div>
    );
}
export type MessageListProps = {
    children: ReactNode;
    className?: string;
    intro?: {
        description: string;
        title: string;
    };
    style?: CSSProperties;
    /**
     * Enables TanStack Virtual for this list's entire mounted lifetime. Callers
     * that can grow into long histories must opt in from the first render so
     * crossing an arbitrary row-count threshold never reparents live rows.
     */
    virtualize?: boolean;
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
    const list = useRef<HTMLDivElement>(null);
    const following = useRef(true);
    const items = Children.toArray(props.children);
    const virtualized = props.virtualize === true;
    // TanStack Virtual deliberately owns mutable measurement functions; this leaf
    // remains outside compiler memoization while every rendered row stays eligible.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: virtualized ? items.length : 0,
        estimateSize: () => 72,
        getItemKey: (index) => {
            const item = items[index];
            return isValidElement(item) && item.key !== null ? item.key : index;
        },
        getScrollElement: () => list.current,
        initialOffset: virtualized ? items.length * 72 : 0,
        overscan: 12,
        useFlushSync: false,
    });
    const scrollToBottom = () => {
        const element = list.current;
        if (element) element.scrollTop = element.scrollHeight - element.clientHeight;
    };
    useLayoutEffect(() => {
        const element = list.current;
        if (!element) return;
        scrollToBottom();
        const onScroll = () => {
            following.current =
                element.scrollHeight - element.scrollTop - element.clientHeight <=
                FOLLOW_BOTTOM_THRESHOLD;
        };
        element.addEventListener("scroll", onScroll, { passive: true });
        const observer = new MutationObserver(() => {
            if (following.current) scrollToBottom();
        });
        observer.observe(element, { characterData: true, childList: true, subtree: true });
        return () => {
            observer.disconnect();
            element.removeEventListener("scroll", onScroll);
        };
    }, []);
    useLayoutEffect(() => {
        if (!following.current) return;
        if (virtualized && items.length > 0)
            virtualizer.scrollToIndex(items.length - 1, { align: "end" });
        else scrollToBottom();
    }, [items.length, virtualized, virtualizer]);
    return (
        <div
            className={["happy2-message-list", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="message-list"
            ref={list}
            style={props.style}
        >
            <div className="happy2-message-list__content" data-happy2-ui="message-list-content">
                <div
                    aria-hidden="true"
                    className="happy2-message-list__spacer"
                    data-happy2-ui="message-list-spacer"
                />
                {props.intro
                    ? ((intro) => (
                          <header
                              className="happy2-message-list__intro"
                              data-happy2-ui="message-list-intro"
                          >
                              <h2
                                  className="happy2-message-list__intro-title"
                                  data-happy2-ui="message-list-intro-title"
                              >
                                  {intro.title}
                              </h2>
                              <p
                                  className="happy2-message-list__intro-description"
                                  data-happy2-ui="message-list-intro-description"
                              >
                                  {intro.description}
                              </p>
                          </header>
                      ))(props.intro)
                    : null}
                {virtualized ? (
                    <div
                        className="happy2-message-list__virtual"
                        data-happy2-ui="message-list-virtual"
                        style={{ height: `${virtualizer.getTotalSize()}px` }}
                    >
                        {virtualizer.getVirtualItems().map((virtualItem) => (
                            <div
                                className="happy2-message-list__virtual-row"
                                data-index={virtualItem.index}
                                key={virtualItem.key}
                                ref={virtualizer.measureElement}
                                style={{ transform: `translateY(${virtualItem.start}px)` }}
                            >
                                {items[virtualItem.index]}
                            </div>
                        ))}
                    </div>
                ) : (
                    props.children
                )}
            </div>
        </div>
    );
}
/** Centered mono date pill over a hairline, separating message days. */
export function DayDivider(props: { className?: string; label: string }) {
    return (
        <div
            aria-label={props.label}
            className={["happy2-day-divider", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="day-divider"
            role="separator"
        >
            <span
                aria-hidden="true"
                className="happy2-day-divider__line"
                data-happy2-ui="day-divider-line"
            />
            <span className="happy2-day-divider__label" data-happy2-ui="day-divider-label">
                {props.label}
            </span>
            <span
                aria-hidden="true"
                className="happy2-day-divider__line"
                data-happy2-ui="day-divider-line"
            />
        </div>
    );
}
export type SystemNoticeSegment =
    | {
          kind: "text";
          text: string;
      }
    | {
          kind: "ref";
          text: string;
      };
/* Split a service line into plain runs and highlighted @user / #channel refs.
   The regex keeps the delimiters so spacing and punctuation survive verbatim;
   a ref token is the sigil plus an unbroken run of word characters. */
const SYSTEM_NOTICE_REF = /([@#][\p{L}\p{N}_.-]+)/u;
function systemNoticeSegments(text: string): SystemNoticeSegment[] {
    return text
        .split(SYSTEM_NOTICE_REF)
        .filter((part) => part.length > 0)
        .map((part) =>
            SYSTEM_NOTICE_REF.test(part) && (part[0] === "@" || part[0] === "#")
                ? { kind: "ref", text: part }
                : { kind: "text", text: part },
        );
}
/**
 * Centered, low-emphasis service line for the message stream — the service
 * agent's membership announcements ("@ada joined #welcome"). It is not a chat
 * bubble: a small leading glyph sits beside muted body text, with @user and
 * #channel references color-lifted so the actors read at a glance.
 */
export function SystemNotice(props: {
    className?: string;
    icon?: IconName;
    style?: CSSProperties;
    text: string;
}) {
    const segments = systemNoticeSegments(props.text);
    return (
        <div
            aria-label={props.text}
            className={["happy2-system-notice", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="system-notice"
            role="note"
            style={props.style}
        >
            <span
                aria-hidden="true"
                className="happy2-system-notice__icon"
                data-happy2-ui="system-notice-icon"
            >
                <Icon name={props.icon ?? "users"} size={14} />
            </span>
            <span className="happy2-system-notice__text" data-happy2-ui="system-notice-text">
                {segments.map((segment, index) =>
                    segment.kind === "ref" ? (
                        <span
                            className="happy2-system-notice__ref"
                            data-happy2-ui="system-notice-ref"
                            key={`${segment.text}-${index}`}
                        >
                            {segment.text}
                        </span>
                    ) : (
                        <span key={index}>{segment.text}</span>
                    ),
                )}
            </span>
        </div>
    );
}
