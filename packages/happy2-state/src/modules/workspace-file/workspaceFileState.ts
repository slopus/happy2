import { createStore, type StoreApi } from "zustand/vanilla";
import {
    UserError,
    WorkspaceFileConflictError,
    type WorkspaceFileWriteInput,
    type WorkspaceTextFile,
    type WorkspaceTextPatch,
} from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export function textPatchApply(content: string, patch: WorkspaceTextPatch): string {
    let cursor = 0;
    let result = "";
    for (const edit of patch.edits) {
        if (
            !Number.isSafeInteger(edit.start) ||
            !Number.isSafeInteger(edit.end) ||
            edit.start < cursor ||
            edit.end < edit.start ||
            edit.end > content.length
        )
            throw new UserError(
                "Workspace file edits must be sorted, non-overlapping, and within the file.",
                "workspace_invalid_patch",
            );
        result += content.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
    }
    return result + content.slice(cursor);
}

export function textPatchFromContents(base: string, desired: string): WorkspaceTextPatch {
    if (base === desired) return { edits: [] };
    let prefix = 0;
    const prefixLimit = Math.min(base.length, desired.length);
    while (prefix < prefixLimit && base[prefix] === desired[prefix]) prefix += 1;
    let suffix = 0;
    const suffixLimit = Math.min(base.length - prefix, desired.length - prefix);
    while (
        suffix < suffixLimit &&
        base[base.length - suffix - 1] === desired[desired.length - suffix - 1]
    )
        suffix += 1;
    return {
        edits: [
            {
                start: prefix,
                end: base.length - suffix,
                text: desired.slice(prefix, desired.length - suffix),
            },
        ],
    };
}

export function textPatchRebase(
    base: string,
    current: string,
    local: WorkspaceTextPatch,
): WorkspaceTextPatch | undefined {
    textPatchApply(base, local);
    const remote = textPatchFromContents(base, current).edits[0];
    if (!remote) return local;
    const delta = remote.text.length - (remote.end - remote.start);
    const edits = [] as { start: number; end: number; text: string }[];
    for (const edit of local.edits) {
        const sameInsertion =
            edit.start === edit.end && remote.start === remote.end && edit.start === remote.start;
        if (sameInsertion) return undefined;
        if (edit.end <= remote.start) edits.push(edit);
        else if (edit.start >= remote.end)
            edits.push({ ...edit, start: edit.start + delta, end: edit.end + delta });
        else return undefined;
    }
    return { edits };
}

export interface WorkspaceFileActionContext {
    readonly runtime: StateRuntime;
    workspaceFileGet(chatId: string, path: string): WorkspaceFileStore | undefined;
    workspaceReconcile(chatId: string): void;
}

const workspaceFileTails = new WeakMap<WorkspaceFileStore, Promise<void>>();

async function workspaceFileSerialize<Result>(
    store: WorkspaceFileStore,
    work: () => Promise<Result>,
): Promise<Result> {
    const tail = workspaceFileTails.get(store) ?? Promise.resolve();
    const result = tail.then(work, work);
    workspaceFileTails.set(
        store,
        result.then(
            () => undefined,
            () => undefined,
        ),
    );
    return result;
}

/** Deletes one retained editor file, retrying only when conflicting contents are unchanged. */
export async function workspaceFileDelete(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<void> {
    const binding = context.workspaceFileGet(chatId, path);
    if (!binding) return;
    await workspaceFileSerialize(binding, async () => {
        const snapshot = binding.getState();
        let base = snapshot.file.type === "ready" ? snapshot.file.value : undefined;
        if (!base) return;
        binding.getState().workspaceFileInput({ type: "contentSaving" });
        let idempotencyKey = context.runtime.createId();
        for (let conflictAttempt = 1; conflictAttempt <= 3; conflictAttempt += 1) {
            try {
                await context.runtime.operationWithIdempotencyKey(
                    "deleteWorkspaceFile",
                    idempotencyKey,
                    { chatId, path, expectedVersion: base.version },
                );
                if (context.workspaceFileGet(chatId, path) === binding)
                    binding.getState().workspaceFileInput({ type: "fileDeleted" });
                context.workspaceReconcile(chatId);
                return;
            } catch (error) {
                const failure = userError(error, "Could not delete the workspace file.");
                if (failure.code !== "workspace_file_conflict") {
                    binding
                        .getState()
                        .workspaceFileInput({ type: "contentSaveFailed", error: failure });
                    return;
                }
                let latest;
                try {
                    latest = (await context.runtime.operation("getWorkspaceFile", { chatId, path }))
                        .file;
                } catch (readError) {
                    if (userError(readError).code === "not_found") {
                        if (context.workspaceFileGet(chatId, path) === binding)
                            binding.getState().workspaceFileInput({ type: "fileDeleted" });
                        context.workspaceReconcile(chatId);
                        return;
                    }
                    binding.getState().workspaceFileInput({
                        type: "contentSaveFailed",
                        error: userError(readError, "Could not refresh the workspace file."),
                    });
                    return;
                }
                if (conflictAttempt === 3 || base.content !== latest.content) {
                    binding.getState().workspaceFileInput({
                        type: "contentConflict",
                        error: new WorkspaceFileConflictError(path, latest, undefined, failure),
                        currentFile: latest,
                    });
                    return;
                }
                base = latest;
                // Retrying transport for one expected version keeps its key. A confirmed
                // metadata-only conflict changes the expected version and is a new mutation.
                idempotencyKey = context.runtime.createId();
            }
        }
    });
}

/** Loads one retained editor file and discards completion only if its cached store was evicted. */
export async function workspaceFileLoad(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<void> {
    const binding = context.workspaceFileGet(chatId, path);
    if (!binding || binding.getState().file.type !== "unloaded") return;
    binding.getState().workspaceFileInput({ type: "fileLoading" });
    try {
        const result = await context.runtime.operation("getWorkspaceFile", { chatId, path });
        if (context.workspaceFileGet(chatId, path) === binding)
            binding.getState().workspaceFileInput({ type: "fileLoaded", file: result.file });
    } catch (error) {
        if (context.workspaceFileGet(chatId, path) === binding)
            binding
                .getState()
                .workspaceFileInput({ type: "fileLoadFailed", error: userError(error) });
    }
}

export interface WorkspaceFileOpenContext {
    workspaceFileAcquire(chatId: string, path: string): WorkspaceFileStore;
    workspaceFileRelease(chatId: string, path: string): void;
    workspaceFileLoad(chatId: string, path: string): void;
}

/** Acquires one versioned editor lease and starts its load without retaining the workspace tree. */
export function workspaceFileOpen(
    context: WorkspaceFileOpenContext,
    chatId: string,
    path: string,
): WorkspaceFileHandle {
    const binding = context.workspaceFileAcquire(chatId, path);
    context.workspaceFileLoad(chatId, path);
    let disposed = false;
    return {
        ...binding,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.workspaceFileRelease(chatId, path);
        },
    };
}

/** Serializes one editor save and conservatively rebases non-overlapping conflict updates. */
export async function workspaceFileSave(
    context: WorkspaceFileActionContext,
    chatId: string,
    path: string,
): Promise<void> {
    const binding = context.workspaceFileGet(chatId, path);
    if (!binding) return;
    await workspaceFileSerialize(binding, async () => {
        const snapshot = binding.getState();
        const base = snapshot.file.type === "ready" ? snapshot.file.value : undefined;
        if (!base || snapshot.content === base.content) return;
        binding.getState().workspaceFileInput({ type: "contentSaving" });
        let currentBase: WorkspaceTextFile = base;
        let patch = textPatchFromContents(base.content, snapshot.content);
        let attemptedContent = snapshot.content;
        let request: WorkspaceFileWriteInput = {
            path,
            expectedVersion: base.version,
            patch,
        };
        let idempotencyKey = context.runtime.createId();
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
                    binding.getState().workspaceFileInput({
                        type: "contentSaved",
                        file,
                        submittedContent: snapshot.content,
                    });
                context.workspaceReconcile(chatId);
                return;
            } catch (error) {
                const failure = userError(error, "Could not write the workspace file.");
                if (failure.code !== "workspace_file_conflict") {
                    binding
                        .getState()
                        .workspaceFileInput({ type: "contentSaveFailed", error: failure });
                    return;
                }
                let latest;
                try {
                    latest = await workspaceFileCurrent(context, chatId, path);
                } catch (readError) {
                    binding.getState().workspaceFileInput({
                        type: "contentSaveFailed",
                        error: userError(readError, "Could not refresh the workspace file."),
                    });
                    return;
                }
                if (conflictAttempt === 3 || !latest) {
                    binding.getState().workspaceFileInput({
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
                    binding.getState().workspaceFileInput({
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
                // A rebased write has a new payload and expected version, so it is a new logical
                // mutation. Transport retries of either payload still reuse that payload's key.
                idempotencyKey = context.runtime.createId();
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

/** Creates one retained editor-file store; its base contents die independently of the tree. */
export function workspaceFileStoreCreate(
    chatId: string,
    path: string,
    output: (event: WorkspaceFileOutput) => void = () => undefined,
): WorkspaceFileStore {
    const store = createStore<WorkspaceFileState>()((set) => ({
        chatId,
        path,
        file: { type: "unloaded" },
        content: "",
        saveState: { type: "clean" },
        contentUpdate(content): void {
            set((snapshot) =>
                snapshot.content === content
                    ? snapshot
                    : { ...snapshot, content, saveState: { type: "dirty" } },
            );
        },
        contentSave(): void {
            output({ type: "contentSaveRequested", chatId, path });
        },
        fileDelete(): void {
            output({ type: "fileDeleteRequested", chatId, path });
        },
        workspaceFileInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "fileLoading":
                        return { ...snapshot, file: { type: "loading" } };
                    case "fileLoaded":
                        const preserveLocalContent = snapshot.saveState.type === "dirty";
                        return {
                            ...snapshot,
                            file: { type: "ready", value: event.file },
                            content: preserveLocalContent ? snapshot.content : event.file.content,
                            saveState: preserveLocalContent
                                ? snapshot.saveState
                                : { type: "clean" },
                        };
                    case "fileLoadFailed":
                        return { ...snapshot, file: { type: "error", error: event.error } };
                    case "contentSaving":
                        return { ...snapshot, saveState: { type: "saving" } };
                    case "contentSaved":
                        return {
                            ...snapshot,
                            file: { type: "ready", value: event.file },
                            content:
                                snapshot.content === event.submittedContent
                                    ? event.file.content
                                    : snapshot.content,
                            saveState:
                                snapshot.content === event.submittedContent
                                    ? { type: "clean" }
                                    : { type: "dirty" },
                        };
                    case "contentSaveFailed":
                        return { ...snapshot, saveState: { type: "error", error: event.error } };
                    case "contentConflict":
                        return {
                            ...snapshot,
                            file: event.currentFile
                                ? { type: "ready", value: event.currentFile }
                                : snapshot.file,
                            saveState: {
                                type: "conflict",
                                error: event.error,
                                currentFile: event.currentFile,
                            },
                        };
                    case "fileDeleted":
                        return {
                            ...snapshot,
                            file: { type: "unloaded" },
                            content: "",
                            saveState: { type: "clean" },
                        };
                }
            });
        },
    }));
    workspaceFileTails.set(store, Promise.resolve());
    return store;
}

export type WorkspaceFileSaveState =
    | { readonly type: "clean" }
    | { readonly type: "dirty" }
    | { readonly type: "saving" }
    | { readonly type: "error"; readonly error: UserError }
    | {
          readonly type: "conflict";
          readonly error: UserError;
          readonly currentFile?: WorkspaceTextFile;
      };

export interface WorkspaceFileSnapshot {
    readonly chatId: string;
    readonly path: string;
    readonly file: Loadable<WorkspaceTextFile>;
    readonly content: string;
    readonly saveState: WorkspaceFileSaveState;
}

export type WorkspaceFileOutput =
    | { readonly type: "contentSaveRequested"; readonly chatId: string; readonly path: string }
    | { readonly type: "fileDeleteRequested"; readonly chatId: string; readonly path: string };

export type WorkspaceFileInput =
    | { readonly type: "fileLoading" }
    | { readonly type: "fileLoaded"; readonly file: WorkspaceTextFile }
    | { readonly type: "fileLoadFailed"; readonly error: UserError }
    | { readonly type: "contentSaving" }
    | {
          readonly type: "contentSaved";
          readonly file: WorkspaceTextFile;
          readonly submittedContent: string;
      }
    | { readonly type: "contentSaveFailed"; readonly error: UserError }
    | {
          readonly type: "contentConflict";
          readonly error: UserError;
          readonly currentFile?: WorkspaceTextFile;
      }
    | { readonly type: "fileDeleted" };

export interface WorkspaceFileState extends WorkspaceFileSnapshot {
    contentUpdate(content: string): void;
    contentSave(): void;
    fileDelete(): void;
    workspaceFileInput(event: WorkspaceFileInput): void;
}

export type WorkspaceFileStore = StoreApi<WorkspaceFileState>;

export interface WorkspaceFileHandle extends WorkspaceFileStore, Disposable {}
