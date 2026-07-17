import { Happy2Api } from "../../api.js";
import {
    clientWorkspace,
    createWorkspaceRecord,
    setWorkspaceRequestedDirectories,
} from "../../workspace.js";
import { userError } from "../runtime/stateRuntime.js";
import type { WorkspaceActionContext } from "./workspaceActionContext.js";
import { workspaceDirectoriesUpdate } from "./workspaceDirectoriesUpdate.js";

/** Loads the initial tree for an already retained workspace without creating a missing surface. */
export async function workspaceLoad(
    context: WorkspaceActionContext,
    chatId: string,
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding || binding.record) return;
    binding.workspaceInput({ type: "workspaceLoading" });
    try {
        await binding.serialize(async () => {
            if (binding.record) return;
            const response = await context.runtime.read((transport) =>
                new Happy2Api(transport).workspace(chatId),
            );
            if (response.notModified)
                throw new Error("An unloaded workspace cannot be not modified.");
            if (context.workspaceGet(chatId) !== binding) return;
            binding.record = setWorkspaceRequestedDirectories(
                createWorkspaceRecord(response.workspace, response.etag),
                binding.store.get().requestedDirectories,
            );
            binding.initialEtag = response.etag;
            binding.workspaceInput({
                type: "workspaceLoaded",
                workspace: clientWorkspace(chatId, binding.record),
            });
        });
        const requested = binding.store.get().requestedDirectories;
        if (binding.record && requested.length > 0)
            await workspaceDirectoriesUpdate(context, chatId, requested);
    } catch (error) {
        if (context.workspaceGet(chatId) === binding)
            binding.workspaceInput({ type: "workspaceFailed", error: userError(error) });
    }
}
