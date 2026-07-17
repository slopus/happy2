import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { WorkspaceFileStoreBinding } from "./workspaceFileStore.js";

export interface WorkspaceFileActionContext {
    readonly runtime: StateRuntime;
    workspaceFileGet(chatId: string, path: string): WorkspaceFileStoreBinding | undefined;
    workspaceReconcile(chatId: string): void;
}
