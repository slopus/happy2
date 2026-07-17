import type { WorkspaceFileOutput } from "./workspaceFileTypes.js";

export interface WorkspaceFileOutputContext {
    workspaceFileSave(chatId: string, path: string): void;
    workspaceFileDelete(chatId: string, path: string): void;
}

/** Routes editor-local save/delete intent into the owning asynchronous action layer. */
export function workspaceFileOutputRoute(
    context: WorkspaceFileOutputContext,
    event: WorkspaceFileOutput,
): void {
    if (event.type === "contentSaveRequested") context.workspaceFileSave(event.chatId, event.path);
    else context.workspaceFileDelete(event.chatId, event.path);
}
