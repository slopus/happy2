import type { ThreadsStore } from "happy2-state";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { StoreSurface } from "../../StoreSurface";
import { ThreadList } from "../../ThreadList";
export interface ThreadsPageProps {
    store: ThreadsStore;
    imageUrl?: (fileId?: string) => string | undefined;
    onSelect?: (childChatId: string) => void;
}
/** Complete followed-thread index backed by one ThreadsStore. */
export function ThreadsPage(props: ThreadsPageProps) {
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const threads = (() => {
                    const state = snapshot.threads;
                    return state.type === "ready"
                        ? state.value.map((thread) => ({
                              id: thread.chat.id,
                              title: thread.root.text || "Thread",
                              snippet: thread.root.text || undefined,
                              participants: thread.root.sender
                                  ? [
                                        {
                                            initials: initials(thread.root.sender.displayName),
                                            imageUrl: props.imageUrl?.(
                                                thread.root.sender.photoFileId,
                                            ),
                                        },
                                    ]
                                  : [],
                              replyCount: thread.root.threadReplyCount,
                              unreadCount: thread.chat.unreadCount,
                              lastActivity: formatDate(thread.chat.updatedAt),
                              subscribed: thread.chat.followed,
                          }))
                        : [];
                })();
                return threads.length > 0 ? (
                    <Box
                        style={{
                            display: "flex",
                            flex: "1 1 0%",
                            flexDirection: "column",
                            minHeight: 0,
                            overflowY: "auto",
                        }}
                    >
                        <Box
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                padding: "16px",
                            }}
                        >
                            {snapshot.actionError ? (
                                <Banner tone="danger" title="Thread action failed">
                                    {snapshot.actionError.message}
                                </Banner>
                            ) : null}
                            {snapshot.pageError ? (
                                <Banner
                                    action={{ label: "Retry", onClick: store.threadsMore }}
                                    tone="danger"
                                    title="More threads failed to load"
                                >
                                    {snapshot.pageError.message}
                                </Banner>
                            ) : null}
                            <ThreadList
                                onSelect={(id) => {
                                    store.threadReadMark(id);
                                    props.onSelect?.(id);
                                }}
                                threads={threads}
                            />
                            {snapshot.nextCursor ? (
                                <Button
                                    onClick={store.threadsMore}
                                    size="small"
                                    variant="secondary"
                                >
                                    Load more
                                </Button>
                            ) : null}
                        </Box>
                    </Box>
                ) : (
                    <EmptyState
                        action={
                            snapshot.threads.type === "error"
                                ? { label: "Retry", onClick: store.threadsRetry }
                                : undefined
                        }
                        description={
                            snapshot.threads.type === "error"
                                ? snapshot.threads.error.message
                                : "Follow-up conversations and thread replies collect here."
                        }
                        icon="thread"
                        title={
                            snapshot.threads.type === "loading"
                                ? "Loading threads…"
                                : snapshot.threads.type === "error"
                                  ? "Threads failed to load"
                                  : "No threads yet"
                        }
                    />
                );
            }}
        </StoreSurface>
    );
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
