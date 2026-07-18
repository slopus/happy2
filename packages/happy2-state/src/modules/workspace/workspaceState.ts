import { ApiResponseError, Happy2Api, type WorkspaceListing } from "../../api.js";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type ClientWorkspace, type UserError } from "../../types.js";
import {
    clientWorkspace,
    createWorkspaceRecord,
    removeWorkspaceDirectory,
    replaceWorkspaceInitial,
    setWorkspaceDirectory,
    setWorkspaceRequestedDirectories,
    type WorkspaceRecord,
} from "../../workspace.js";
import { type Loadable } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface WorkspaceActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    workspaceGet(chatId: string): WorkspaceStore | undefined;
}

const workspaceRecords = new WeakMap<WorkspaceStore, WorkspaceRecord>();
const workspaceEtags = new WeakMap<WorkspaceStore, string>();
const workspaceTails = new WeakMap<WorkspaceStore, Promise<void>>();

async function workspaceSerialize<Result>(
    store: WorkspaceStore,
    work: () => Promise<Result>,
): Promise<Result> {
    const tail = workspaceTails.get(store) ?? Promise.resolve();
    const result = tail.then(work, work);
    workspaceTails.set(
        store,
        result.then(
            () => undefined,
            () => undefined,
        ),
    );
    return result;
}

/** Reconciles the exact retained directory set and publishes one complete workspace projection. */
export async function workspaceDirectoriesUpdate(
    context: WorkspaceActionContext,
    chatId: string,
    directories: readonly string[],
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    const record = binding && workspaceRecords.get(binding);
    if (!binding || !record) return;
    await workspaceSerialize(binding, async () => {
        const current = workspaceRecords.get(binding);
        if (!current) return;
        let next = setWorkspaceRequestedDirectories(current, directories);
        const desired = new Set(directories);
        for (const directory of next.directories.keys()) {
            if (!desired.has(directory)) next = removeWorkspaceDirectory(next, directory);
        }
        const aggregate = clientWorkspace(chatId, next);
        const visible = new Set(aggregate.paths);
        const unloaded = new Set(aggregate.unloadedDirectories);
        const missing = directories.filter(
            (directory) =>
                !next.directories.has(directory) &&
                (unloaded.has(directory) || !visible.has(directory)),
        );
        const loaded = await Promise.all(
            missing.map(
                async (directory) =>
                    [
                        directory,
                        { pages: await workspaceFetchDirectory(context, chatId, directory, 1) },
                    ] as const,
            ),
        );
        if (context.workspaceGet(chatId) !== binding) return;
        for (const [directory, record] of loaded)
            next = setWorkspaceDirectory(next, directory, record);
        workspaceRecords.set(binding, next);
        binding.getState().workspaceInput({
            type: "workspaceLoaded",
            workspace: clientWorkspace(chatId, next),
        });
    });
}

/** Appends one workspace-directory page and restarts paging when the server invalidates its cursor. */
export async function workspaceDirectoryMore(
    context: WorkspaceActionContext,
    chatId: string,
    directory: string,
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding || !workspaceRecords.has(binding)) return;
    await workspaceSerialize(binding, async () => {
        const current = workspaceRecords.get(binding);
        const loaded = current?.directories.get(directory);
        const cursor = loaded?.pages.at(-1)?.nextCursor;
        if (!current || !loaded || !cursor) return;
        let pages;
        try {
            const response = await context.runtime.read((transport) =>
                new Happy2Api(transport).workspace(chatId, { directory, cursor }),
            );
            if (response.notModified) throw new Error("A directory page cannot be not modified.");
            workspaceListingAssertDirectory(response.workspace, directory);
            pages = [...loaded.pages, response.workspace];
        } catch (error) {
            if (!(error instanceof ApiResponseError && error.code === "workspace_cursor_stale"))
                throw error;
            pages = await workspaceFetchDirectory(
                context,
                chatId,
                directory,
                loaded.pages.length + 1,
            );
        }
        if (context.workspaceGet(chatId) !== binding) return;
        const next = setWorkspaceDirectory(current, directory, { pages });
        workspaceRecords.set(binding, next);
        binding.getState().workspaceInput({
            type: "workspaceLoaded",
            workspace: clientWorkspace(chatId, next),
        });
    });
}

export async function workspaceFetchDirectory(
    context: WorkspaceActionContext,
    chatId: string,
    directory: string,
    pageCount: number,
): Promise<readonly WorkspaceListing[]> {
    let lastError: unknown;
    for (let restart = 0; restart < 3; restart += 1) {
        const pages: WorkspaceListing[] = [];
        let cursor: string | undefined;
        try {
            while (pages.length < pageCount) {
                const response = await context.runtime.read((transport) =>
                    new Happy2Api(transport).workspace(chatId, { directory, cursor }),
                );
                if (response.notModified)
                    throw new Error("A directory page cannot be not modified.");
                workspaceListingAssertDirectory(response.workspace, directory);
                pages.push(response.workspace);
                cursor = response.workspace.nextCursor;
                if (!cursor) break;
            }
            return pages;
        } catch (error) {
            lastError = error;
            if (!(error instanceof ApiResponseError && error.code === "workspace_cursor_stale"))
                throw error;
        }
    }
    throw lastError;
}

/** Loads the initial tree for an already retained workspace without creating a missing surface. */
export async function workspaceLoad(
    context: WorkspaceActionContext,
    chatId: string,
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding || workspaceRecords.has(binding)) return;
    binding.getState().workspaceInput({ type: "workspaceLoading" });
    try {
        await workspaceSerialize(binding, async () => {
            if (workspaceRecords.has(binding)) return;
            const response = await context.runtime.read((transport) =>
                new Happy2Api(transport).workspace(chatId),
            );
            if (response.notModified)
                throw new Error("An unloaded workspace cannot be not modified.");
            if (context.workspaceGet(chatId) !== binding) return;
            const record = setWorkspaceRequestedDirectories(
                createWorkspaceRecord(response.workspace, response.etag),
                binding.getState().requestedDirectories,
            );
            workspaceRecords.set(binding, record);
            if (response.etag) workspaceEtags.set(binding, response.etag);
            else workspaceEtags.delete(binding);
            binding.getState().workspaceInput({
                type: "workspaceLoaded",
                workspace: clientWorkspace(chatId, record),
            });
        });
        const requested = binding.getState().requestedDirectories;
        if (workspaceRecords.has(binding) && requested.length > 0)
            await workspaceDirectoriesUpdate(context, chatId, requested);
    } catch (error) {
        if (context.workspaceGet(chatId) === binding)
            binding.getState().workspaceInput({ type: "workspaceFailed", error: userError(error) });
    }
}

export interface WorkspaceOpenContext {
    workspaceAcquire(chatId: string): WorkspaceStore;
    workspaceRelease(chatId: string): void;
    workspaceLoad(chatId: string): void;
}

/** Acquires one deduplicated workspace-tree lease and starts its initial load once. */
export function workspaceOpen(context: WorkspaceOpenContext, chatId: string): WorkspaceHandle {
    const binding = context.workspaceAcquire(chatId);
    context.workspaceLoad(chatId);
    let disposed = false;
    return {
        ...binding,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.workspaceRelease(chatId);
        },
    };
}

/** Revalidates only a retained workspace after a realtime hint, preserving retained page depth. */
export async function workspaceReconcile(
    context: WorkspaceActionContext,
    chatId: string,
): Promise<void> {
    const binding = context.workspaceGet(chatId);
    if (!binding || !workspaceRecords.has(binding)) return;
    await workspaceSerialize(binding, async () => {
        const current = workspaceRecords.get(binding);
        if (!current) return;
        const response = await context.runtime.read((transport) =>
            new Happy2Api(transport).workspace(chatId, { etag: workspaceEtags.get(binding) }),
        );
        if (response.notModified) return;
        const loaded = await Promise.all(
            [...current.directories].map(async ([directory, record]) => {
                try {
                    return [
                        directory,
                        {
                            pages: await workspaceFetchDirectory(
                                context,
                                chatId,
                                directory,
                                record.pages.length,
                            ),
                        },
                    ] as const;
                } catch (error) {
                    if (error instanceof ApiResponseError && error.code === "not_found")
                        return undefined;
                    throw error;
                }
            }),
        );
        let next = replaceWorkspaceInitial(current, response.workspace, response.etag, new Map());
        for (const item of loaded) if (item) next = setWorkspaceDirectory(next, item[0], item[1]);
        const unloaded = new Set(clientWorkspace(chatId, next).unloadedDirectories);
        for (const directory of next.requestedDirectories) {
            if (next.directories.has(directory) || !unloaded.has(directory)) continue;
            next = setWorkspaceDirectory(next, directory, {
                pages: await workspaceFetchDirectory(context, chatId, directory, 1),
            });
        }
        if (context.workspaceGet(chatId) !== binding) return;
        workspaceRecords.set(binding, next);
        if (response.etag) workspaceEtags.set(binding, response.etag);
        else workspaceEtags.delete(binding);
        binding.getState().workspaceInput({
            type: "workspaceLoaded",
            workspace: clientWorkspace(chatId, next),
        });
    });
}

/** Creates one retained workspace-tree surface with every local mutation inline. */
export function workspaceStoreCreate(
    chatId: string,
    output: (event: WorkspaceOutput) => void = () => undefined,
): WorkspaceStore {
    const store = createStore<WorkspaceState>()((set, get) => ({
        chatId,
        requestedDirectories: [],
        status: { type: "unloaded" },
        directoriesUpdate(directories): void {
            const normalized = [...new Set(directories)].sort(compare);
            if (!same(get().requestedDirectories, normalized))
                set({ requestedDirectories: normalized });
            output({ type: "directoriesUpdated", chatId, directories: normalized });
        },
        directoryMore(directory): void {
            output({ type: "directoryMoreRequested", chatId, directory });
        },
        workspaceInput(event): void {
            set((snapshot) => {
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
    }));
    workspaceTails.set(store, Promise.resolve());
    return store;
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

export interface WorkspaceSnapshot {
    readonly chatId: string;
    readonly requestedDirectories: readonly string[];
    readonly status: Loadable<ClientWorkspace>;
}

export type WorkspaceOutput =
    | {
          readonly type: "directoriesUpdated";
          readonly chatId: string;
          readonly directories: readonly string[];
      }
    | {
          readonly type: "directoryMoreRequested";
          readonly chatId: string;
          readonly directory: string;
      };

export type WorkspaceInput =
    | { readonly type: "workspaceLoading" }
    | { readonly type: "workspaceLoaded"; readonly workspace: ClientWorkspace }
    | { readonly type: "workspaceFailed"; readonly error: UserError };

export interface WorkspaceState extends WorkspaceSnapshot {
    directoriesUpdate(directories: readonly string[]): void;
    directoryMore(directory: string): void;
    workspaceInput(event: WorkspaceInput): void;
}

export type WorkspaceStore = StoreApi<WorkspaceState>;

export interface WorkspaceHandle extends WorkspaceStore, Disposable {}
