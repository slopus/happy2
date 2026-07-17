import { ApiResponseError, Happy2Api } from "../../api.js";
import {
    clientWorkspace,
    replaceWorkspaceInitial,
    setWorkspaceDirectory,
} from "../../workspace.js";
import type { WorkspaceActionContext } from "./workspaceActionContext.js";
import { workspaceFetchDirectory } from "./workspaceFetchDirectory.js";

/** Revalidates only a retained workspace after a realtime hint, preserving retained page depth. */
export async function workspaceReconcile(
    context: WorkspaceActionContext,
    chatId: string,
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding?.record) return;
    await binding.serialize(async () => {
        const current = binding.record;
        if (!current) return;
        const response = await context.runtime.read((transport) =>
            new Happy2Api(transport).workspace(chatId, { etag: binding.initialEtag }),
        );
        if (response.notModified) return;
        const loaded = await Promise.all(
            [...current.directories].map(async ([directory, record]) => {
                try {
                    return [
                        directory,
                        {
                            pages: await workspaceFetchDirectory(
                                context,
                                chatId,
                                directory,
                                record.pages.length,
                            ),
                        },
                    ] as const;
                } catch (error) {
                    if (error instanceof ApiResponseError && error.code === "not_found")
                        return undefined;
                    throw error;
                }
            }),
        );
        let next = replaceWorkspaceInitial(current, response.workspace, response.etag, new Map());
        for (const item of loaded) if (item) next = setWorkspaceDirectory(next, item[0], item[1]);
        const unloaded = new Set(clientWorkspace(chatId, next).unloadedDirectories);
        for (const directory of next.requestedDirectories) {
            if (next.directories.has(directory) || !unloaded.has(directory)) continue;
            next = setWorkspaceDirectory(next, directory, {
                pages: await workspaceFetchDirectory(context, chatId, directory, 1),
            });
        }
        if (context.workspaceGet(chatId) !== binding) return;
        binding.record = next;
        binding.initialEtag = response.etag;
        binding.workspaceInput({
            type: "workspaceLoaded",
            workspace: clientWorkspace(chatId, next),
        });
    });
}
