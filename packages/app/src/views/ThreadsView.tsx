import { Show } from "solid-js";
import { Box, EmptyState, ThreadList, type ThreadItem } from "rigged-ui";

export type ThreadsViewProps = {
    threads: ThreadItem[];
    onSelect?: (id: string) => void;
};

/**
 * Threads feature area — a scrollable ThreadList of the threads you follow.
 * Threads are not a live server surface yet (`server.ts` only fetches a single
 * message's replies via `thread(messageId)`, not a followed-threads list), so
 * the list is driven by the representative mock data passed in as `threads`.
 * When nothing is followed, an EmptyState fills the region. // TODO(server):
 * back this with a followed-threads endpoint once one exists.
 */
export function ThreadsView(props: ThreadsViewProps) {
    return (
        <Show
            fallback={
                <EmptyState
                    description="Follow-up conversations and thread replies collect here."
                    icon="thread"
                    title="Threads"
                />
            }
            when={props.threads.length > 0}
        >
            <Box
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    flex: "1 1 0%",
                    "min-height": 0,
                    "overflow-y": "auto",
                    padding: "16px",
                }}
            >
                <ThreadList onSelect={props.onSelect} threads={props.threads} />
            </Box>
        </Show>
    );
}
