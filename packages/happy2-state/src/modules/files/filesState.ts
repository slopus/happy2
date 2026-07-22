import { createStore, type StoreApi } from "zustand/vanilla";
import { type UploadedFile } from "../../resources.js";
import { type FileSummary, type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface FileUploadContext {
    readonly runtime: StateRuntime;
}

/** Uploads one attachment through the authenticated runtime and returns its durable file identity. */
export async function fileUpload(
    context: FileUploadContext,
    body: FormData,
): Promise<UploadedFile> {
    const result = await context.runtime.operation("uploadFile", { body });
    return result.file;
}

/** Resolves one accessible file to a short-lived URL without exposing transport credentials. */
export async function fileSignedUrlCreate(
    context: FileUploadContext,
    fileId: string,
): Promise<string> {
    const result = await context.runtime.operation("createFileSignedUrl", { fileId });
    return result.signedUrl.url;
}

export interface FilesActionContext {
    readonly runtime: StateRuntime;
    readonly files: FilesStore;
}

const generations = new WeakMap<FilesStore, number>();

/** Loads or appends the shared-file gallery while preserving one coarse surface snapshot. */
export async function filesLoad(context: FilesActionContext, append = false): Promise<void> {
    const generation = (generations.get(context.files) ?? 0) + 1;
    generations.set(context.files, generation);
    const snapshot = context.files.getState();
    const before = append ? snapshot.nextCursor : undefined;
    if (append && !before) {
        context.files.getState().filesInput({
            type: "filesLoaded",
            files: [],
            append: true,
        });
        return;
    }
    if (!append) context.files.getState().filesInput({ type: "filesLoading" });
    try {
        const result = await context.runtime.operation("getFiles", {
            limit: 60,
            ...(before ? { before } : {}),
        });
        if (generations.get(context.files) !== generation) return;
        if (append && context.files.getState().nextCursor !== before) return;
        context.files.getState().filesInput({
            type: "filesLoaded",
            files: result.files,
            nextCursor: result.nextCursor,
            append,
        });
    } catch (error) {
        if (generations.get(context.files) !== generation) return;
        context.files.getState().filesInput({
            type: append ? "filesPageFailed" : "filesFailed",
            error: userError(error),
        });
    }
}

/** Creates the shared-files surface store with one subscription for the complete gallery. */
export function filesStoreCreate(
    output: (event: FilesOutput) => void = () => undefined,
): FilesStore {
    return createStore<FilesState>()((set, get) => ({
        status: { type: "unloaded" },
        files: [],
        loadingMore: false,
        filesMore(): void {
            if (get().loadingMore || !get().nextCursor) return;
            set({ loadingMore: true });
            output({ type: "filesMoreRequested" });
        },
        filesInput(event): void {
            set((snapshot) => {
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
    }));
}

function mergeFiles(
    current: readonly import("../../types.js").FileSummary[],
    incoming: readonly import("../../types.js").FileSummary[],
) {
    const values = new Map(current.map((file) => [file.id, file]));
    for (const file of incoming) values.set(file.id, file);
    return [...values.values()];
}

export interface FilesSnapshot {
    readonly status: Loadable<true>;
    readonly files: readonly FileSummary[];
    readonly nextCursor?: string;
    readonly loadingMore: boolean;
    readonly pageError?: UserError;
}

export type FilesOutput = { readonly type: "filesMoreRequested" };

export type FilesInput =
    | { readonly type: "filesLoading" }
    | {
          readonly type: "filesLoaded";
          readonly files: readonly FileSummary[];
          readonly nextCursor?: string;
          readonly append: boolean;
      }
    | { readonly type: "filesFailed"; readonly error: UserError }
    | { readonly type: "filesPageFailed"; readonly error: UserError };

export interface FilesState extends FilesSnapshot {
    filesMore(): void;
    filesInput(event: FilesInput): void;
}

export type FilesStore = StoreApi<FilesState>;
