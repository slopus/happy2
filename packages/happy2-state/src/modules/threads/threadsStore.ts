import { storeCreate } from "../../kernel/store.js";
import type { ThreadsInput, ThreadsOutput, ThreadsSnapshot, ThreadsStore } from "./threadsTypes.js";

export interface ThreadsStoreBinding {
    readonly store: ThreadsStore;
    threadsInput(event: ThreadsInput): void;
    dispose(): void;
}

/** Creates the coarse inbox-style thread list and its explicit local intents. */
export function threadsStoreCreateBinding(
    output: (event: ThreadsOutput) => void = () => undefined,
): ThreadsStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<ThreadsSnapshot>({
        threads: { type: "unloaded" },
    });
    let disposed = false;
    return {
        store: {
            ...readonlyStore,
            threadReadMark(rootMessageId, throughMessageId): void {
                if (disposed) return;
                writer.update((snapshot) =>
                    snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
                );
                output({ type: "threadReadSubmitted", rootMessageId, throughMessageId });
            },
            threadSubscriptionSet(rootMessageId, subscribed, notificationLevel): void {
                if (disposed) return;
                writer.update((snapshot) =>
                    snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
                );
                output({
                    type: "threadSubscriptionSubmitted",
                    rootMessageId,
                    subscribed,
                    notificationLevel,
                });
            },
            threadsMore(): void {
                if (disposed) return;
                const snapshot = readonlyStore.get();
                if (snapshot.threads.type === "ready" && snapshot.nextCursor)
                    output({ type: "threadsMoreRequested" });
            },
        },
        threadsInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.type === "threadsLoading")
                    return { ...snapshot, threads: { type: "loading" } };
                if (event.type === "threadsFailed")
                    return { ...snapshot, threads: { type: "error", error: event.error } };
                if (event.type === "threadsPageFailed")
                    return { ...snapshot, pageError: event.error };
                if (event.type === "threadActionFailed")
                    return { ...snapshot, actionError: event.error };
                const current =
                    event.append && snapshot.threads.type === "ready" ? snapshot.threads.value : [];
                const incoming = new Map(event.threads.map((thread) => [thread.root.id, thread]));
                const known = new Set(current.map((thread) => thread.root.id));
                return {
                    threads: {
                        type: "ready",
                        value: [
                            ...current.map((thread) => incoming.get(thread.root.id) ?? thread),
                            ...event.threads.filter((thread) => !known.has(thread.root.id)),
                        ],
                    },
                    nextCursor: event.nextCursor,
                    actionError: undefined,
                };
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
