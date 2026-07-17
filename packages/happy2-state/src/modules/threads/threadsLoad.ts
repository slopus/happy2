import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import { messageProject } from "../chat/messageProject.js";
import type { ThreadsStoreBinding } from "./threadsStore.js";

export interface ThreadsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly threads: ThreadsStoreBinding;
}

const generations = new WeakMap<ThreadsStoreBinding, number>();

/** Loads the coarse subscribed-thread list without materializing individual reply timelines. */
export async function threadsLoad(context: ThreadsActionContext, append = false): Promise<void> {
    const generation = (generations.get(context.threads) ?? 0) + 1;
    generations.set(context.threads, generation);
    const before = append ? context.threads.store.get().nextCursor : undefined;
    if (!append) context.threads.threadsInput({ type: "threadsLoading" });
    try {
        const result = await context.runtime.operation("getThreads", { limit: 100, before });
        if (generations.get(context.threads) !== generation) return;
        if (append && context.threads.store.get().nextCursor !== before) return;
        context.threads.threadsInput({
            type: "threadsLoaded",
            threads: result.threads.map((thread) => ({
                ...thread,
                root: messageProject(context.identities, thread.root),
            })),
            nextCursor: result.nextCursor,
            append,
        });
    } catch (error) {
        if (generations.get(context.threads) !== generation) return;
        context.threads.threadsInput({
            type: append ? "threadsPageFailed" : "threadsFailed",
            error: userError(error),
        });
    }
}
