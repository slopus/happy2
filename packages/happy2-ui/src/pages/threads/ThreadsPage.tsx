import type { ThreadsStore } from "happy2-state";
import { Box } from "../../Box";
import { EmptyState } from "../../EmptyState";
import { StoreSurface } from "../../StoreSurface";
import { ThreadList } from "../../ThreadList";
export interface ThreadsPageProps {
    store: ThreadsStore;
    imageUrl?: (fileId?: string) => string | undefined;
    onSelect?: (rootMessageId: string) => void;
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
                              id: thread.root.id,
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
                              replyCount: thread.replyCount,
                              unreadCount: thread.unreadCount,
                              lastActivity: formatDate(thread.updatedAt),
                              subscribed: thread.subscribed,
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
                            padding: "16px",
                        }}
                    >
                        <ThreadList
                            onSelect={(id) => {
                                store.threadReadMark(id);
                                props.onSelect?.(id);
                            }}
                            threads={threads}
                        />
                    </Box>
                ) : (
                    <EmptyState
                        description="Follow-up conversations and thread replies collect here."
                        icon="thread"
                        title={snapshot.threads.type === "loading" ? "Loading threads…" : "Threads"}
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
