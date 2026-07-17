import type { WorkspaceHandle } from "./workspaceTypes.js";
import type { WorkspaceStoreBinding } from "./workspaceStore.js";

export interface WorkspaceOpenContext {
    workspaceAcquire(chatId: string): WorkspaceStoreBinding;
    workspaceRelease(chatId: string): void;
    workspaceLoad(chatId: string): void;
}

/** Acquires one deduplicated workspace-tree lease and starts its initial load once. */
export function workspaceOpen(context: WorkspaceOpenContext, chatId: string): WorkspaceHandle {
    const binding = context.workspaceAcquire(chatId);
    context.workspaceLoad(chatId);
    let disposed = false;
    return {
        ...binding.store,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.workspaceRelease(chatId);
        },
    };
}
