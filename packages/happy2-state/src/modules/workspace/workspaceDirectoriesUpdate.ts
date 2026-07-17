import {
    clientWorkspace,
    removeWorkspaceDirectory,
    setWorkspaceDirectory,
    setWorkspaceRequestedDirectories,
} from "../../workspace.js";
import type { WorkspaceActionContext } from "./workspaceActionContext.js";
import { workspaceFetchDirectory } from "./workspaceFetchDirectory.js";

/** Reconciles the exact retained directory set and publishes one complete workspace projection. */
export async function workspaceDirectoriesUpdate(
    context: WorkspaceActionContext,
    chatId: string,
    directories: readonly string[],
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding?.record) return;
    await binding.serialize(async () => {
        if (!binding.record) return;
        let next = setWorkspaceRequestedDirectories(binding.record, directories);
        const desired = new Set(directories);
        for (const directory of next.directories.keys()) {
            if (!desired.has(directory)) next = removeWorkspaceDirectory(next, directory);
        }
        const aggregate = clientWorkspace(chatId, next);
        const visible = new Set(aggregate.paths);
        const unloaded = new Set(aggregate.unloadedDirectories);
        const missing = directories.filter(
            (directory) =>
                !next.directories.has(directory) &&
                (unloaded.has(directory) || !visible.has(directory)),
        );
        const loaded = await Promise.all(
            missing.map(
                async (directory) =>
                    [
                        directory,
                        { pages: await workspaceFetchDirectory(context, chatId, directory, 1) },
                    ] as const,
            ),
        );
        if (context.workspaceGet(chatId) !== binding) return;
        for (const [directory, record] of loaded)
            next = setWorkspaceDirectory(next, directory, record);
        binding.record = next;
        binding.workspaceInput({
            type: "workspaceLoaded",
            workspace: clientWorkspace(chatId, next),
        });
    });
}
