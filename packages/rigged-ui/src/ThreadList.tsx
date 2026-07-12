import { For, Show, splitProps, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { CountBadge } from "./Badge";
import { Icon } from "./Icon";

export type ThreadParticipant = { initials: string; tone?: ToneName; imageUrl?: string };
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
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
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
            class="rigged-thread-list__item"
            data-rigged-ui="thread-list-item"
            data-subscribed={thread().subscribed === false ? "false" : undefined}
            data-thread-id={thread().id}
            data-unread={unread() ? "" : undefined}
            onClick={() => props.onSelect?.(thread().id)}
            type="button"
        >
            <span class="rigged-thread-list__avatars" data-rigged-ui="thread-list-avatars">
                <For each={shown()}>
                    {(participant, index) => (
                        <Avatar
                            class="rigged-thread-list__avatar"
                            imageUrl={participant.imageUrl}
                            initials={participant.initials}
                            size="sm"
                            style={{ "z-index": String(stackCount() - index()) }}
                            tone={participant.tone}
                        />
                    )}
                </For>
                <Show when={overflow() > 0}>
                    {/* Chip rides on top of the lane so the "+N" stays fully legible. */}
                    <span
                        class="rigged-thread-list__more"
                        data-rigged-ui="thread-list-avatar-more"
                        style={{ "z-index": String(stackCount() + 1) }}
                    >
                        +{overflow()}
                    </span>
                </Show>
            </span>

            <span class="rigged-thread-list__main" data-rigged-ui="thread-list-main">
                <span class="rigged-thread-list__title-row">
                    <span class="rigged-thread-list__title" data-rigged-ui="thread-list-title">
                        {thread().title}
                    </span>
                    <Show when={thread().subscribed === false}>
                        <span
                            aria-label="Muted"
                            class="rigged-thread-list__follow"
                            data-rigged-ui="thread-list-follow"
                        >
                            <Icon name="bell" size={14} />
                        </span>
                    </Show>
                    <span class="rigged-thread-list__time" data-rigged-ui="thread-list-time">
                        {thread().lastActivity}
                    </span>
                </span>

                <span class="rigged-thread-list__meta-row">
                    <span class="rigged-thread-list__snippet" data-rigged-ui="thread-list-snippet">
                        {thread().snippet}
                    </span>
                    <span
                        class="rigged-thread-list__trailing"
                        data-rigged-ui="thread-list-trailing"
                    >
                        <span
                            class="rigged-thread-list__replies"
                            data-rigged-ui="thread-list-replies"
                        >
                            <span
                                class="rigged-thread-list__replies-icon"
                                data-rigged-ui="thread-list-replies-icon"
                            >
                                <Icon name="reply" size={12} />
                            </span>
                            <span
                                class="rigged-thread-list__replies-count"
                                data-rigged-ui="thread-list-reply-count"
                            >
                                {thread().replyCount}
                            </span>
                        </span>
                        <Show when={unread()}>
                            <CountBadge
                                class="rigged-thread-list__unread"
                                count={thread().unreadCount!}
                            />
                        </Show>
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
    const [local, rest] = splitProps(props, [
        "class",
        "emptyLabel",
        "onSelect",
        "style",
        "threads",
    ]);

    return (
        <div
            {...rest}
            class={["rigged-thread-list", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="thread-list"
            role="list"
            style={local.style}
        >
            <Show
                fallback={
                    <div class="rigged-thread-list__empty" data-rigged-ui="thread-list-empty">
                        {local.emptyLabel ?? "No followed threads"}
                    </div>
                }
                when={local.threads.length > 0}
            >
                <For each={local.threads}>
                    {(thread) => <ThreadRow onSelect={local.onSelect} thread={thread} />}
                </For>
            </Show>
        </div>
    );
}
