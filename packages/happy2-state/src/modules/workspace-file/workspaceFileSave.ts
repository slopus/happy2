import {
    WorkspaceFileConflictError,
    type WorkspaceFileWriteInput,
    type WorkspaceTextFile,
} from "../../types.js";
import { userError } from "../runtime/stateRuntime.js";
import { textPatchApply, textPatchFromContents, textPatchRebase } from "./textPatch.js";
import type { WorkspaceFileActionContext } from "./workspaceFileActionContext.js";

/** Serializes one editor save and conservatively rebases non-overlapping conflict updates. */
export async function workspaceFileSave(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<void> {
    const binding = context.workspaceFileGet(chatId, path);
    if (!binding) return;
    await binding.serialize(async () => {
        const snapshot = binding.store.get();
        const base = snapshot.file.type === "ready" ? snapshot.file.value : undefined;
        if (!base || snapshot.content === base.content) return;
        binding.workspaceFileInput({ type: "contentSaving" });
        let currentBase: WorkspaceTextFile = base;
        let patch = textPatchFromContents(base.content, snapshot.content);
        let attemptedContent = snapshot.content;
        let request: WorkspaceFileWriteInput = {
            path,
            expectedVersion: base.version,
            patch,
        };
        const idempotencyKey = context.runtime.createId();
        for (let conflictAttempt = 1; conflictAttempt <= 3; conflictAttempt += 1) {
            try {
                const result = await context.runtime.operationWithIdempotencyKey(
                    "writeWorkspaceFile",
                    idempotencyKey,
                    { chatId, ...request },
                );
                const file: WorkspaceTextFile = {
                    path: result.file.path,
                    content: attemptedContent,
                    size: result.file.size,
                    version: result.file.version,
                };
                if (context.workspaceFileGet(chatId, path) === binding)
                    binding.workspaceFileInput({
                        type: "contentSaved",
                        file,
                        submittedContent: snapshot.content,
                    });
                context.workspaceReconcile(chatId);
                return;
            } catch (error) {
                const failure = userError(error, "Could not write the workspace file.");
                if (failure.code !== "workspace_file_conflict") {
                    binding.workspaceFileInput({ type: "contentSaveFailed", error: failure });
                    return;
                }
                let latest;
                try {
                    latest = await workspaceFileCurrent(context, chatId, path);
                } catch (readError) {
                    binding.workspaceFileInput({
                        type: "contentSaveFailed",
                        error: userError(readError, "Could not refresh the workspace file."),
                    });
                    return;
                }
                if (conflictAttempt === 3 || !latest) {
                    binding.workspaceFileInput({
                        type: "contentConflict",
                        error: new WorkspaceFileConflictError(
                            path,
                            latest,
                            attemptedContent,
                            failure,
                        ),
                        currentFile: latest,
                    });
                    return;
                }
                const rebased = textPatchRebase(currentBase.content, latest.content, patch);
                if (!rebased) {
                    binding.workspaceFileInput({
                        type: "contentConflict",
                        error: new WorkspaceFileConflictError(
                            path,
                            latest,
                            attemptedContent,
                            failure,
                        ),
                        currentFile: latest,
                    });
                    return;
                }
                currentBase = latest;
                patch = rebased;
                attemptedContent = textPatchApply(latest.content, rebased);
                request = { path, expectedVersion: latest.version, patch: rebased };
            }
        }
    });
}

async function workspaceFileCurrent(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<WorkspaceTextFile | undefined> {
    try {
        return (await context.runtime.operation("getWorkspaceFile", { chatId, path })).file;
    } catch (error) {
        if (userError(error).code === "not_found") return undefined;
        throw error;
    }
}
