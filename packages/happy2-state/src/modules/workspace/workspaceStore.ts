import type { WorkspaceListing } from "../../api.js";
import { storeCreate } from "../../kernel/store.js";
import type { WorkspaceRecord } from "../../workspace.js";
import type {
    WorkspaceInput,
    WorkspaceOutput,
    WorkspaceSnapshot,
    WorkspaceStore,
} from "./workspaceTypes.js";

export interface WorkspaceStoreBinding {
    readonly store: WorkspaceStore;
    record?: WorkspaceRecord;
    initialEtag?: string;
    workspaceInput(event: WorkspaceInput): void;
    serialize<Result>(work: () => Promise<Result>): Promise<Result>;
    dispose(): void;
}

/** Creates one retained workspace-tree surface and its owner-only mutable record. */
export function workspaceStoreCreateBinding(
    chatId: string,
    output: (event: WorkspaceOutput) => void = () => undefined,
): WorkspaceStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<WorkspaceSnapshot>({
        chatId,
        requestedDirectories: [],
        status: { type: "unloaded" },
    });
    let disposed = false;
    let tail: Promise<void> = Promise.resolve();
    const store: WorkspaceStore = {
        ...readonlyStore,
        directoriesUpdate(directories): void {
            if (disposed) return;
            const normalized = [...new Set(directories)].sort(compare);
            writer.update((snapshot) =>
                same(snapshot.requestedDirectories, normalized)
                    ? snapshot
                    : { ...snapshot, requestedDirectories: normalized },
            );
            output({ type: "directoriesUpdated", chatId, directories: normalized });
        },
        directoryMore(directory): void {
            if (!disposed) output({ type: "directoryMoreRequested", chatId, directory });
        },
    };
    const binding: WorkspaceStoreBinding = {
        store,
        workspaceInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                switch (event.type) {
                    case "workspaceLoading":
                        return snapshot.status.type === "loading"
                            ? snapshot
                            : { ...snapshot, status: { type: "loading" } };
                    case "workspaceLoaded":
                        return {
                            ...snapshot,
                            requestedDirectories: event.workspace.requestedDirectories,
                            status: { type: "ready", value: event.workspace },
                        };
                    case "workspaceFailed":
                        return { ...snapshot, status: { type: "error", error: event.error } };
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
            binding.record = undefined;
            binding.initialEtag = undefined;
            writer.dispose();
        },
    };
    return binding;
}

export function workspaceListingAssertDirectory(listing: WorkspaceListing, expected: string): void {
    if (listing.directory !== expected)
        throw new Error("The server returned a mismatched workspace directory.");
}

function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function same(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((item, index) => item === right[index]);
}
