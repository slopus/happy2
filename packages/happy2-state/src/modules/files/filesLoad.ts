import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { FilesStoreBinding } from "./filesStore.js";

export interface FilesActionContext {
    readonly runtime: StateRuntime;
    readonly files: FilesStoreBinding;
}
const generations = new WeakMap<FilesStoreBinding, number>();

/** Loads or appends the shared-file gallery while preserving one coarse surface snapshot. */
export async function filesLoad(context: FilesActionContext, append = false): Promise<void> {
    const generation = (generations.get(context.files) ?? 0) + 1;
    generations.set(context.files, generation);
    const snapshot = context.files.store.get();
    const before = append ? snapshot.nextCursor : undefined;
    if (append && !before) {
        context.files.filesInput({
            type: "filesLoaded",
            files: [],
            append: true,
        });
        return;
    }
    if (!append) context.files.filesInput({ type: "filesLoading" });
    try {
        const result = await context.runtime.operation("getFiles", {
            limit: 60,
            ...(before ? { before } : {}),
        });
        if (generations.get(context.files) !== generation) return;
        if (append && context.files.store.get().nextCursor !== before) return;
        context.files.filesInput({
            type: "filesLoaded",
            files: result.files,
            nextCursor: result.nextCursor,
            append,
        });
    } catch (error) {
        if (generations.get(context.files) !== generation) return;
        context.files.filesInput({
            type: append ? "filesPageFailed" : "filesFailed",
            error: userError(error),
        });
    }
}
