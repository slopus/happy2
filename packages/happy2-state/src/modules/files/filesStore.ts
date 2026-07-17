import { storeCreate } from "../../kernel/store.js";
import type { FilesInput, FilesOutput, FilesSnapshot, FilesStore } from "./filesTypes.js";

export interface FilesStoreBinding {
    readonly store: FilesStore;
    filesInput(event: FilesInput): void;
    dispose(): void;
}

/** Creates the shared-files surface store with one subscription for the complete gallery. */
export function filesStoreCreateBinding(
    output: (event: FilesOutput) => void = () => undefined,
): FilesStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<FilesSnapshot>({
        status: { type: "unloaded" },
        files: [],
        loadingMore: false,
    });
    let disposed = false;
    return {
        store: {
            ...readonlyStore,
            filesMore(): void {
                if (disposed || readonlyStore.get().loadingMore || !readonlyStore.get().nextCursor)
                    return;
                writer.update((snapshot) => ({ ...snapshot, loadingMore: true }));
                output({ type: "filesMoreRequested" });
            },
        },
        filesInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.type === "filesLoading")
                    return { ...snapshot, status: { type: "loading" } };
                if (event.type === "filesFailed")
                    return {
                        ...snapshot,
                        status: { type: "error", error: event.error },
                        loadingMore: false,
                    };
                if (event.type === "filesPageFailed")
                    return { ...snapshot, loadingMore: false, pageError: event.error };
                const files = event.append ? mergeFiles(snapshot.files, event.files) : event.files;
                return {
                    ...snapshot,
                    status: { type: "ready", value: true },
                    files,
                    nextCursor: event.nextCursor,
                    loadingMore: false,
                    pageError: undefined,
                };
            });
        },
        dispose(): void {
            disposed = true;
            writer.dispose();
        },
    };
}

function mergeFiles(
    current: readonly import("../../types.js").FileSummary[],
    incoming: readonly import("../../types.js").FileSummary[],
) {
    const values = new Map(current.map((file) => [file.id, file]));
    for (const file of incoming) values.set(file.id, file);
    return [...values.values()];
}
