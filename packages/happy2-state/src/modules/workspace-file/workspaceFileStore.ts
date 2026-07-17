import { storeCreate } from "../../kernel/store.js";
import type {
    WorkspaceFileInput,
    WorkspaceFileOutput,
    WorkspaceFileSnapshot,
    WorkspaceFileStore,
} from "./workspaceFileTypes.js";

export interface WorkspaceFileStoreBinding {
    readonly store: WorkspaceFileStore;
    workspaceFileInput(event: WorkspaceFileInput): void;
    serialize<Result>(work: () => Promise<Result>): Promise<Result>;
    dispose(): void;
}

/** Creates one retained editor-file store; its base contents die independently of the tree. */
export function workspaceFileStoreCreateBinding(
    chatId: string,
    path: string,
    output: (event: WorkspaceFileOutput) => void = () => undefined,
): WorkspaceFileStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<WorkspaceFileSnapshot>({
        chatId,
        path,
        file: { type: "unloaded" },
        content: "",
        saveState: { type: "clean" },
    });
    let disposed = false;
    let tail: Promise<void> = Promise.resolve();
    const store: WorkspaceFileStore = {
        ...readonlyStore,
        contentUpdate(content): void {
            if (disposed) return;
            writer.update((snapshot) =>
                snapshot.content === content
                    ? snapshot
                    : { ...snapshot, content, saveState: { type: "dirty" } },
            );
        },
        contentSave(): void {
            if (!disposed) output({ type: "contentSaveRequested", chatId, path });
        },
        fileDelete(): void {
            if (!disposed) output({ type: "fileDeleteRequested", chatId, path });
        },
    };
    const binding: WorkspaceFileStoreBinding = {
        store,
        workspaceFileInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
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
        async serialize<Result>(work: () => Promise<Result>): Promise<Result> {
            const result = tail.then(work, work);
            tail = result.then(
                () => undefined,
                () => undefined,
            );
            return result;
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
    return binding;
}
