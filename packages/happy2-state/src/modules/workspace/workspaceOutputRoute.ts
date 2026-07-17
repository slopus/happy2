import type { WorkspaceOutput } from "./workspaceTypes.js";

export interface WorkspaceOutputContext {
    workspaceDirectoriesUpdate(chatId: string, directories: readonly string[]): void;
    workspaceDirectoryMore(chatId: string, directory: string): void;
}

/** Routes local tree intent into owner actions without giving the store transport access. */
export function workspaceOutputRoute(
    context: WorkspaceOutputContext,
    event: WorkspaceOutput,
): void {
    switch (event.type) {
        case "directoriesUpdated":
            context.workspaceDirectoriesUpdate(event.chatId, event.directories);
            return;
        case "directoryMoreRequested":
            context.workspaceDirectoryMore(event.chatId, event.directory);
    }
}
