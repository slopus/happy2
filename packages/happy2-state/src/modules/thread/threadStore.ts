import { storeCreate } from "../../kernel/store.js";
import { messageItemCompare } from "../chat/messageProject.js";
import type { ThreadInput, ThreadOutput, ThreadSnapshot, ThreadStore } from "./threadTypes.js";

export interface ThreadStoreBinding {
    readonly store: ThreadStore;
    threadInput(event: ThreadInput): void;
    dispose(): void;
}

/** Creates one retained thread surface with one subscription for root and replies. */
export function threadStoreCreateBinding(
    rootMessageId: string,
    output: (event: ThreadOutput) => void = () => undefined,
): ThreadStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<ThreadSnapshot>({
        rootMessageId,
        root: { type: "unloaded" },
        replies: [],
        hasMore: false,
    });
    let disposed = false;
    return {
        store: {
            ...readonlyStore,
            textSubmit(input): void {
                if (disposed) return;
                output({ type: "textSubmitted", rootMessageId, input });
            },
        },
        threadInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.type === "threadLoading")
                    return { ...snapshot, root: { type: "loading" } };
                if (event.type === "threadFailed")
                    return { ...snapshot, root: { type: "error", error: event.error } };
                if (event.type === "threadLoaded")
                    return {
                        ...snapshot,
                        root: { type: "ready", value: event.root },
                        replies: event.replies,
                        hasMore: event.hasMore,
                    };
                const index = snapshot.replies.findIndex(
                    (reply) =>
                        reply.message.id === event.reply.message.id ||
                        (event.reply.clientMutationId &&
                            reply.clientMutationId === event.reply.clientMutationId),
                );
                const replies = [...snapshot.replies];
                if (index < 0) replies.push(event.reply);
                else replies[index] = event.reply;
                replies.sort(messageItemCompare);
                return { ...snapshot, replies };
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
