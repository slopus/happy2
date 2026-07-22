import { partitionComponentProps } from "./componentProps";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
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
import { Avatar, type AvatarSize, type ToneName } from "./Avatar";
import { happyLogoUrl } from "./assets";
import { AutomatedTag } from "./AutomatedTag";
import { ReactionChip } from "./Badge";
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
    /** Tiny decoded ThumbHash shown while the attachment preview downloads. */
    placeholderUrl?: string;
    alt?: string;
    /** Intrinsic pixel dimensions — reserve a stable box before the image loads. */
    width?: number;
    height?: number;
};
const MEDIA_SINGLE_MAX_W = 380;
const MEDIA_SINGLE_MAX_H = 320;
const MEDIA_SINGLE_FALLBACK_W = 240;
const MEDIA_SINGLE_FALLBACK_RATIO = "4 / 3";
/**
 * Inline box for a lone photo: an aspect-ratio plus a capped width reserves the
 * exact layout up front so nothing reflows when the image finishes loading.
 * Missing source dimensions use a stable 4:3 fallback rather than the image's
 * eventual intrinsic size. Multi-image tiles are square via CSS and need none.
 */
function mediaItemStyle(image: MessageImage, count: number): CSSProperties | undefined {
    if (count !== 1) return undefined;
    if (!image.width || !image.height)
        return {
            width: `${MEDIA_SINGLE_FALLBACK_W}px`,
            aspectRatio: MEDIA_SINGLE_FALLBACK_RATIO,
        };
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
    /**
     * The message was posted through automation (a plugin/API acting on the
     * author's behalf) rather than typed by hand. Shows a restrained "Automated"
     * marker beside the author. This is orthogonal to `agent`: an automated
     * message is still attributed to its human author and keeps their identity —
     * it is not the separate agent/system identity treatment.
     */
    automated?: boolean;
    /** Who the message addressed, e.g. "To agents · Happy + 1". */
    audienceLabel?: string;
    /** Compact optional action placed in the author metadata before the time. */
    metaAccessory?: ReactNode;
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
    /**
     * Native plugin message-menu contribution triggers rendered in the hover
     * action toolbar, supplied by the application (each owns its own invocation
     * state). Message-scoped, so the app binds each to this message's id.
     */
    contributions?: ReactNode;
    onReactionAdd?: () => void;
    onReactionSelect?: (emoji: string) => void;
    /**
     * The viewer's own outgoing message. Renders as a right-aligned accent
     * bubble with no avatar and no author name — only humans send, so an `own`
     * message is never also an `agent`. Incoming human messages (neither flag)
     * render as a left neutral bubble; agents render on the surface unbubbled.
     */
    own?: boolean;
    reactions?: MessageReaction[];
    /** Emoji available in the hover reaction picker. IDs are passed to `onReactionSelect`. */
    reactionOptions?: EmojiItem[];
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
 * One chat message on the app surface: a compact inline identity, author/time row,
 * rich body segments, attachment slot, reactions, and reply affordance.
 */
export function Message(props: MessageProps) {
    const [local, rest] = partitionComponentProps(props, [
        "agent",
        "actionsVisible",
        "audienceLabel",
        "automated",
        "author",
        "body",
        "children",
        "className",
        "compact",
        "contributions",
        "deliveryState",
        "generationStatus",
        "grouped",
        "gutterTime",
        "imageUrl",
        "images",
        "onImageOpen",
        "initials",
        "menuItems",
        "metaAccessory",
        "onAuthorSelect",
        "onMenuSelect",
        "onReactionAdd",
        "onReactionSelect",
        "own",
        "reactions",
        "reactionOptions",
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
    const body = useRef<HTMLDivElement>(null);
    const generationMarker = useRef<HTMLSpanElement>(null);
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
    const happyAgent = () => local.agent && local.author.trim().toLocaleLowerCase() === "happy";
    const renderAvatar = (size: AvatarSize) => (
        <Avatar
            imageUrl={happyAgent() ? happyLogoUrl : local.imageUrl}
            initials={local.initials ?? deriveInitials(local.author)}
            size={size}
            tone={local.tone}
            type={local.agent ? "agent" : "human"}
        />
    );
    const renderDanglingAvatar = () =>
        local.onAuthorSelect ? (
            <button
                aria-label={authorActionLabel()}
                className="happy2-message__identity happy2-message__avatar-dangling"
                data-happy2-ui="message-identity"
                onClick={() => local.onAuthorSelect?.()}
                type="button"
            >
                {renderAvatar("xs")}
            </button>
        ) : (
            <span className="happy2-message__avatar-dangling">{renderAvatar("xs")}</span>
        );
    const deliveryState = () => local.deliveryState ?? "sent";
    const hasReactionAction = () =>
        Boolean(local.onReactionAdd) ||
        Boolean(local.onReactionSelect && local.reactionOptions?.length);
    const hasMenuAction = () =>
        Boolean(local.onMenuSelect) &&
        Boolean(local.menuItems?.some((item) => item.kind === "item"));
    const hasContributions = () => hasRenderableChild(local.contributions);
    const hasActions = () => deliveryState() !== "sending" && hasContributions();
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
    /* The live cursor is painted at the end of the final rendered text run. It
       stays absolutely positioned so neither a generation-state update nor a
       streamed text tick can alter the message's flow geometry. */
    useLayoutEffect(() => {
        const bodyElement = body.current;
        const marker = generationMarker.current;
        if (!bodyElement || !marker) return;
        const position = () => {
            const textNodes = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
            let textRect: DOMRect | undefined;
            for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
                const text = node as Text;
                if (!text.textContent?.trim()) continue;
                const range = document.createRange();
                range.setStart(text, Math.max(0, text.length - 1));
                range.setEnd(text, text.length);
                const rects = range.getClientRects();
                const finalRect = rects.item(rects.length - 1);
                if (finalRect) textRect = finalRect;
            }
            if (!textRect) {
                marker.style.transform = "translate(0px, 0px)";
                marker.style.visibility = "visible";
                return;
            }
            const bodyRect = bodyElement.getBoundingClientRect();
            marker.style.transform = `translate(${textRect.right - bodyRect.left}px, ${
                textRect.top - bodyRect.top
            }px)`;
            marker.style.visibility = "visible";
        };
        position();
        const observer = new ResizeObserver(position);
        observer.observe(bodyElement);
        return () => observer.disconnect();
    }, [local.body, local.generationStatus]);
    const bodyNode =
        !local.body && local.generationStatus === undefined ? null : isMarkdownBody() ? (
            <div
                className="happy2-message__body happy2-message__body--markdown"
                data-markdown=""
                data-happy2-ui="message-body"
                ref={body}
            >
                {markdownBody}
                {/* An empty generated reply keeps a non-breaking-space line box
                    after completion. The visible stream cursor can therefore
                    disappear without collapsing the message row. */}
                {!local.body && local.generationStatus !== undefined ? (
                    <p aria-hidden="true" className="happy2-message__generation-anchor">
                        {"\u00a0"}
                    </p>
                ) : null}
                {local.generationStatus === "streaming" || local.generationStatus === "failed" ? (
                    <span
                        aria-hidden={local.generationStatus === "failed" ? undefined : true}
                        aria-label={
                            local.generationStatus === "failed" ? "Generation failed" : undefined
                        }
                        className="happy2-message__generation-marker"
                        data-empty={!local.body ? "" : undefined}
                        data-generation-marker={local.generationStatus}
                        data-happy2-ui={
                            local.generationStatus === "streaming"
                                ? "message-stream-caret"
                                : "message-generation-failed"
                        }
                        ref={generationMarker}
                        role={local.generationStatus === "failed" ? "img" : undefined}
                    />
                ) : null}
            </div>
        ) : (
            <div className="happy2-message__body" data-happy2-ui="message-body">
                {segments().map((segment, index) => (
                    <span key={`${segment.kind}-${index}`}>{renderSegment(segment)}</span>
                ))}
            </div>
        );
    // An own attachment/image-only automated message still needs the durable
    // attribution marker. Normal media remains flush: this line exists only
    // when automation requires it, never for ordinary media-only messages.
    const ownBubbleLine =
        local.own &&
        (bodyNode !== null ||
            (local.automated && (Boolean(local.images?.length) || hasAttachments())));
    return (
        <div
            {...rest}
            className={["happy2-message", local.className].filter(Boolean).join(" ")}
            data-agent={local.agent ? "" : undefined}
            data-own={local.own ? "" : undefined}
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
                {!local.own && (!grouped() || local.metaAccessory) ? renderDanglingAvatar() : null}
            </div>
            <div className="happy2-message__content" data-happy2-ui="message-content">
                {/* Own messages carry no meta row — the accent bubble on the
                    right is identity enough; no author, time, or audience pill. */}
                {!local.own && (!grouped() || local.metaAccessory) ? (
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
                        {local.automated ? (
                            <span
                                className="happy2-message__automated"
                                data-happy2-ui="message-automated"
                            >
                                <AutomatedTag />
                            </span>
                        ) : null}
                        {local.metaAccessory ? (
                            <span
                                className="happy2-message__meta-accessory"
                                data-happy2-ui="message-meta-accessory"
                            >
                                {local.metaAccessory}
                            </span>
                        ) : null}
                        <span className="happy2-message__time" data-happy2-ui="message-time">
                            {local.time}
                        </span>
                    </div>
                ) : null}
                {ownBubbleLine ? (
                    <div
                        className="happy2-message__bubble-line"
                        data-happy2-ui="message-bubble-line"
                    >
                        {/* Own messages carry no meta row, so the automation marker
                            rides the bubble line beside the hover time. Unlike the
                            time it stays visible: attribution that a plugin posted
                            on the viewer's behalf must not depend on hover. */}
                        {local.automated ? (
                            <span
                                className="happy2-message__automated happy2-message__automated--own"
                                data-happy2-ui="message-automated"
                            >
                                <AutomatedTag />
                            </span>
                        ) : null}
                        <span
                            className="happy2-message__aside-time"
                            data-happy2-ui="message-aside-time"
                        >
                            {local.gutterTime ?? local.time}
                        </span>
                        {bodyNode}
                    </div>
                ) : (
                    bodyNode
                )}
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
                                data-fixed=""
                                data-media-id={image.id}
                                data-happy2-ui="message-media-item"
                                onClick={() => local.onImageOpen?.(image.id)}
                                style={mediaItemStyle(image, Math.min(local.images!.length, 4))}
                                type="button"
                                key={image.id}
                            >
                                {image.url ? (
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
                                ) : (
                                    <span
                                        aria-label={`Loading ${image.alt ?? "image"}`}
                                        className="happy2-message__media-loading"
                                        data-happy2-ui="message-media-loading"
                                        role="status"
                                        style={
                                            image.placeholderUrl
                                                ? {
                                                      backgroundImage: `url(${image.placeholderUrl})`,
                                                  }
                                                : undefined
                                        }
                                    />
                                )}
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
                    </div>
                ) : null}
            </div>
            {hasActions() ? (
                <>
                    <div className="happy2-message__actions" data-happy2-ui="message-actions">
                        {hasContributions() ? (
                            <span
                                className="happy2-message__contributions"
                                data-happy2-ui="message-contributions"
                            >
                                {local.contributions}
                            </span>
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
    /** Restores a previously detached reader position on this list's first layout. */
    initialScrollPosition?: MessageListScrollPosition;
    /** Reports user scrolling and the final position before this list detaches. */
    onScrollPositionChange?: (position: MessageListScrollPosition) => void;
    style?: CSSProperties;
    /**
     * Enables TanStack Virtual for this list's entire mounted lifetime. Callers
     * that can grow into long histories must opt in from the first render so
     * crossing an arbitrary row-count threshold never reparents live rows.
     */
    virtualize?: boolean;
};
export interface MessageListScrollPosition {
    readonly scrollTop: number;
    readonly following: boolean;
    /** Measured virtual rows needed to interpret scrollTop after this list remounts. */
    readonly measurements?: readonly VirtualItem[];
}
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
    const following = useRef(props.initialScrollPosition?.following ?? true);
    const measurements = useRef(props.initialScrollPosition?.measurements);
    const positionChange = useRef(props.onScrollPositionChange);
    positionChange.current = props.onScrollPositionChange;
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
        initialOffset: virtualized
            ? (props.initialScrollPosition?.scrollTop ?? items.length * 72)
            : 0,
        initialMeasurementsCache: props.initialScrollPosition?.measurements
            ? [...props.initialScrollPosition.measurements]
            : [],
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
        const savedScrollTop = props.initialScrollPosition?.scrollTop;
        if (following.current) scrollToBottom();
        else element.scrollTop = savedScrollTop ?? 0;
        // Virtual-row measurement can compensate the scroll offset after this
        // layout effect. Reapply a parked reader's exact pixel offset once those
        // initial measurements have landed.
        const restoreFrame =
            !following.current && savedScrollTop !== undefined
                ? requestAnimationFrame(() => {
                      element.scrollTop = savedScrollTop;
                  })
                : undefined;
        const positionReport = (captureMeasurements = false) => {
            if (captureMeasurements && virtualized)
                measurements.current = virtualizer.takeSnapshot();
            positionChange.current?.({
                scrollTop: element.scrollTop,
                following: following.current,
                measurements: measurements.current,
            });
        };
        const onScroll = () => {
            following.current =
                element.scrollHeight - element.scrollTop - element.clientHeight <=
                FOLLOW_BOTTOM_THRESHOLD;
            positionReport();
        };
        element.addEventListener("scroll", onScroll, { passive: true });
        const observer = new MutationObserver(() => {
            if (following.current) scrollToBottom();
        });
        observer.observe(element, { characterData: true, childList: true, subtree: true });
        return () => {
            if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
            positionReport(true);
            observer.disconnect();
            element.removeEventListener("scroll", onScroll);
        };
    }, [props.initialScrollPosition?.scrollTop, virtualized, virtualizer]);
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
/** Centered plain-text date separating message days. */
export function DayDivider(props: { className?: string; label: string }) {
    return (
        <div
            aria-label={props.label}
            className={["happy2-day-divider", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="day-divider"
            role="separator"
        >
            <span className="happy2-day-divider__label" data-happy2-ui="day-divider-label">
                {props.label}
            </span>
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
 * Centered, low-emphasis service line for durable chat events such as
 * membership and agent-setting changes. It is not a chat bubble: a small
 * leading glyph sits beside muted body text, with @user and #channel references
 * color-lifted so the affected entities read at a glance.
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
