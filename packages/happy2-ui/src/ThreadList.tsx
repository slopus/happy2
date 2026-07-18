import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { CountBadge } from "./Badge";
import { Icon } from "./Icon";
export type ThreadParticipant = {
    initials: string;
    tone?: ToneName;
    imageUrl?: string;
};
export type ThreadItem = {
    id: string;
    title: string;
    snippet?: string;
    participants: ThreadParticipant[];
    replyCount: number;
    unreadCount?: number;
    lastActivity: string;
    subscribed?: boolean;
};
export type ThreadListProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    threads: ThreadItem[];
    onSelect?: (id: string) => void;
    emptyLabel?: string;
};
/* Show at most three stacked marks; beyond that the third slot becomes a
 * "+N" overflow chip so the lane width never grows past three positions. */
const MAX_AVATARS = 3;
function ThreadRow(props: { onSelect?: (id: string) => void; thread: ThreadItem }) {
    const thread = () => props.thread;
    const unread = () => (thread().unreadCount ?? 0) > 0;
    const participants = () => thread().participants;
    const overflow = () =>
        participants().length > MAX_AVATARS ? participants().length - (MAX_AVATARS - 1) : 0;
    const shown = () =>
        overflow() > 0 ? participants().slice(0, MAX_AVATARS - 1) : participants();
    const stackCount = () => shown().length + (overflow() > 0 ? 1 : 0);
    return (
        <button
            className="happy2-thread-list__item"
            data-happy2-ui="thread-list-item"
            data-subscribed={thread().subscribed === false ? "false" : undefined}
            data-thread-id={thread().id}
            data-unread={unread() ? "" : undefined}
            onClick={() => props.onSelect?.(thread().id)}
            type="button"
        >
            <span className="happy2-thread-list__avatars" data-happy2-ui="thread-list-avatars">
                {shown().map((participant, index) => (
                    <Avatar
                        className="happy2-thread-list__avatar"
                        key={`${participant.initials}-${index}`}
                        imageUrl={participant.imageUrl}
                        initials={participant.initials}
                        size="sm"
                        style={{ zIndex: String(stackCount() - index) }}
                        tone={participant.tone}
                    />
                ))}
                {overflow() > 0 ? (
                    <>
                        {/* Chip rides on top of the lane so the "+N" stays fully legible. */}
                        <span
                            className="happy2-thread-list__more"
                            data-happy2-ui="thread-list-avatar-more"
                            style={{ zIndex: String(stackCount() + 1) }}
                        >
                            +{overflow()}
                        </span>
                    </>
                ) : null}
            </span>

            <span className="happy2-thread-list__main" data-happy2-ui="thread-list-main">
                <span className="happy2-thread-list__title-row">
                    <span className="happy2-thread-list__title" data-happy2-ui="thread-list-title">
                        {thread().title}
                    </span>
                    {thread().subscribed === false ? (
                        <span
                            aria-label="Muted"
                            className="happy2-thread-list__follow"
                            data-happy2-ui="thread-list-follow"
                        >
                            <Icon name="bell" size={14} />
                        </span>
                    ) : null}
                    <span className="happy2-thread-list__time" data-happy2-ui="thread-list-time">
                        {thread().lastActivity}
                    </span>
                </span>

                <span className="happy2-thread-list__meta-row">
                    <span
                        className="happy2-thread-list__snippet"
                        data-happy2-ui="thread-list-snippet"
                    >
                        {thread().snippet}
                    </span>
                    <span
                        className="happy2-thread-list__trailing"
                        data-happy2-ui="thread-list-trailing"
                    >
                        <span
                            className="happy2-thread-list__replies"
                            data-happy2-ui="thread-list-replies"
                        >
                            <span
                                className="happy2-thread-list__replies-icon"
                                data-happy2-ui="thread-list-replies-icon"
                            >
                                <Icon name="reply" size={12} />
                            </span>
                            <span
                                className="happy2-thread-list__replies-count"
                                data-happy2-ui="thread-list-reply-count"
                            >
                                {thread().replyCount}
                            </span>
                        </span>
                        {unread() ? (
                            <CountBadge
                                className="happy2-thread-list__unread"
                                count={thread().unreadCount!}
                            />
                        ) : null}
                    </span>
                </span>
            </span>
        </button>
    );
}
/**
 * C-037 ThreadList — followed-thread rows. Each row shows the thread root and a
 * one-line snippet, a lane of stacked participant avatars (28px, 18px step,
 * "+N" overflow), the last-activity timestamp, a reply-count pill, and an
 * accent unread CountBadge. Muted (unsubscribed) threads carry a faint bell.
 */
export function ThreadList(props: ThreadListProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "emptyLabel",
        "onSelect",
        "style",
        "threads",
    ]);
    return (
        <div
            {...rest}
            className={["happy2-thread-list", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="thread-list"
            role="list"
            style={local.style}
        >
            {local.threads.length > 0 ? (
                local.threads.map((thread) => (
                    <ThreadRow key={thread.id} onSelect={local.onSelect} thread={thread} />
                ))
            ) : (
                <div className="happy2-thread-list__empty" data-happy2-ui="thread-list-empty">
                    {local.emptyLabel ?? "No followed threads"}
                </div>
            )}
        </div>
    );
}
