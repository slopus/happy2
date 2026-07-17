import type { ThreadStoreBinding } from "./threadStore.js";
import type { ThreadHandle } from "./threadTypes.js";

export interface ThreadOpenContext {
    threadAcquire(rootMessageId: string): ThreadStoreBinding;
    threadRelease(rootMessageId: string): void;
    threadLoad(rootMessageId: string): void;
}

/** Acquires one deduplicated thread surface and frees its reply projection on final release. */
export function threadOpen(context: ThreadOpenContext, rootMessageId: string): ThreadHandle {
    const binding = context.threadAcquire(rootMessageId);
    if (binding.store.get().root.type === "unloaded") context.threadLoad(rootMessageId);
    let disposed = false;
    return {
        ...binding.store,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.threadRelease(rootMessageId);
        },
    };
}
