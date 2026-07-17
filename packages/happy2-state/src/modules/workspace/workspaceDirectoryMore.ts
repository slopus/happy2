import { ApiResponseError, Happy2Api } from "../../api.js";
import { clientWorkspace, setWorkspaceDirectory } from "../../workspace.js";
import type { WorkspaceActionContext } from "./workspaceActionContext.js";
import { workspaceFetchDirectory } from "./workspaceFetchDirectory.js";
import { workspaceListingAssertDirectory } from "./workspaceStore.js";

/** Appends one workspace-directory page and restarts paging when the server invalidates its cursor. */
export async function workspaceDirectoryMore(
    context: WorkspaceActionContext,
    chatId: string,
    directory: string,
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding?.record) return;
    await binding.serialize(async () => {
        const current = binding.record;
        const loaded = current?.directories.get(directory);
        const cursor = loaded?.pages.at(-1)?.nextCursor;
        if (!current || !loaded || !cursor) return;
        let pages;
        try {
            const response = await context.runtime.read((transport) =>
                new Happy2Api(transport).workspace(chatId, { directory, cursor }),
            );
            if (response.notModified) throw new Error("A directory page cannot be not modified.");
            workspaceListingAssertDirectory(response.workspace, directory);
            pages = [...loaded.pages, response.workspace];
        } catch (error) {
            if (!(error instanceof ApiResponseError && error.code === "workspace_cursor_stale"))
                throw error;
            pages = await workspaceFetchDirectory(
                context,
                chatId,
                directory,
                loaded.pages.length + 1,
            );
        }
        if (context.workspaceGet(chatId) !== binding) return;
        const next = setWorkspaceDirectory(current, directory, { pages });
        binding.record = next;
        binding.workspaceInput({
            type: "workspaceLoaded",
            workspace: clientWorkspace(chatId, next),
        });
    });
}
