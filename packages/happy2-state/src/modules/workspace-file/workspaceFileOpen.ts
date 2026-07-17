import type { WorkspaceFileHandle } from "./workspaceFileTypes.js";
import type { WorkspaceFileStoreBinding } from "./workspaceFileStore.js";

export interface WorkspaceFileOpenContext {
    workspaceFileAcquire(chatId: string, path: string): WorkspaceFileStoreBinding;
    workspaceFileRelease(chatId: string, path: string): void;
    workspaceFileLoad(chatId: string, path: string): void;
}

/** Acquires one versioned editor lease and starts its load without retaining the workspace tree. */
export function workspaceFileOpen(
    context: WorkspaceFileOpenContext,
    chatId: string,
    path: string,
): WorkspaceFileHandle {
    const binding = context.workspaceFileAcquire(chatId, path);
    context.workspaceFileLoad(chatId, path);
    let disposed = false;
    return {
        ...binding.store,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.workspaceFileRelease(chatId, path);
        },
    };
}
