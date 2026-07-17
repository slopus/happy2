import { ApiResponseError, Happy2Api, type WorkspaceListing } from "../../api.js";
import type { WorkspaceActionContext } from "./workspaceActionContext.js";
import { workspaceListingAssertDirectory } from "./workspaceStore.js";

export async function workspaceFetchDirectory(
    context: WorkspaceActionContext,
    chatId: string,
    directory: string,
    pageCount: number,
): Promise<readonly WorkspaceListing[]> {
    let lastError: unknown;
    for (let restart = 0; restart < 3; restart += 1) {
        const pages: WorkspaceListing[] = [];
        let cursor: string | undefined;
        try {
            while (pages.length < pageCount) {
                const response = await context.runtime.read((transport) =>
                    new Happy2Api(transport).workspace(chatId, { directory, cursor }),
                );
                if (response.notModified)
                    throw new Error("A directory page cannot be not modified.");
                workspaceListingAssertDirectory(response.workspace, directory);
                pages.push(response.workspace);
                cursor = response.workspace.nextCursor;
                if (!cursor) break;
            }
            return pages;
        } catch (error) {
            lastError = error;
            if (!(error instanceof ApiResponseError && error.code === "workspace_cursor_stale"))
                throw error;
        }
    }
    throw lastError;
}
