import type { WorkspaceFileActionContext } from "./workspaceFileActionContext.js";
import { userError } from "../runtime/stateRuntime.js";

/** Loads one retained editor file and discards completion after its final lease closes. */
export async function workspaceFileLoad(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<void> {
    const binding = context.workspaceFileGet(chatId, path);
    if (!binding || binding.store.get().file.type !== "unloaded") return;
    binding.workspaceFileInput({ type: "fileLoading" });
    try {
        const result = await context.runtime.operation("getWorkspaceFile", { chatId, path });
        if (context.workspaceFileGet(chatId, path) === binding)
            binding.workspaceFileInput({ type: "fileLoaded", file: result.file });
    } catch (error) {
        if (context.workspaceFileGet(chatId, path) === binding)
            binding.workspaceFileInput({ type: "fileLoadFailed", error: userError(error) });
    }
}
