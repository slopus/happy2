import { WorkspaceFileConflictError } from "../../types.js";
import { userError } from "../runtime/stateRuntime.js";
import type { WorkspaceFileActionContext } from "./workspaceFileActionContext.js";

/** Deletes one retained editor file, retrying only when conflicting contents are unchanged. */
export async function workspaceFileDelete(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<void> {
    const binding = context.workspaceFileGet(chatId, path);
    if (!binding) return;
    await binding.serialize(async () => {
        const snapshot = binding.store.get();
        let base = snapshot.file.type === "ready" ? snapshot.file.value : undefined;
        if (!base) return;
        binding.workspaceFileInput({ type: "contentSaving" });
        const idempotencyKey = context.runtime.createId();
        for (let conflictAttempt = 1; conflictAttempt <= 3; conflictAttempt += 1) {
            try {
                await context.runtime.operationWithIdempotencyKey(
                    "deleteWorkspaceFile",
                    idempotencyKey,
                    { chatId, path, expectedVersion: base.version },
                );
                if (context.workspaceFileGet(chatId, path) === binding)
                    binding.workspaceFileInput({ type: "fileDeleted" });
                context.workspaceReconcile(chatId);
                return;
            } catch (error) {
                const failure = userError(error, "Could not delete the workspace file.");
                if (failure.code !== "workspace_file_conflict") {
                    binding.workspaceFileInput({ type: "contentSaveFailed", error: failure });
                    return;
                }
                let latest;
                try {
                    latest = (await context.runtime.operation("getWorkspaceFile", { chatId, path }))
                        .file;
                } catch (readError) {
                    if (userError(readError).code === "not_found") {
                        if (context.workspaceFileGet(chatId, path) === binding)
                            binding.workspaceFileInput({ type: "fileDeleted" });
                        context.workspaceReconcile(chatId);
                        return;
                    }
                    binding.workspaceFileInput({
                        type: "contentSaveFailed",
                        error: userError(readError, "Could not refresh the workspace file."),
                    });
                    return;
                }
                if (conflictAttempt === 3 || base.content !== latest.content) {
                    binding.workspaceFileInput({
                        type: "contentConflict",
                        error: new WorkspaceFileConflictError(path, latest, undefined, failure),
                        currentFile: latest,
                    });
                    return;
                }
                base = latest;
            }
        }
    });
}
