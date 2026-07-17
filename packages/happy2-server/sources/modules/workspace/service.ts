import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, watch, type FSWatcher } from "node:fs";
import {
    link,
    lstat,
    mkdir,
    open,
    readdir,
    realpath,
    rename,
    unlink,
    type FileHandle,
} from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import type { ChatWorkspaceTarget, CollaborationRepository } from "../collaboration/repository.js";
import { realtimeTopics, type PubSub } from "../realtime/index.js";
import {
    WorkspaceError,
    type WorkspaceDirectoryPage,
    type WorkspaceFileDeleteResult,
    type WorkspaceFileWriteResult,
    type WorkspaceGitStatus,
    type WorkspaceGitStatusEntry,
    type WorkspaceSnapshot,
    type WorkspaceTextFile,
    type WorkspaceTextPatch,
} from "./types.js";

const CHANGE_DEBOUNCE_MS = 20;
const DEFAULT_DIRECTORY_PAGE_LIMIT = 250;
const MAX_DIRECTORY_PAGE_LIMIT = 1_000;
const DIRECTORY_PAGE_PATH_BYTES = 128 * 1024;
const GIT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const GIT_TIMEOUT_MS = 5_000;
const MAX_CACHED_DIRECTORY_ENTRIES = 20_000;
const MAX_EAGER_DIRECTORY_CHILDREN = 400;
const MAX_PRELOAD_DIRECTORIES = 128;
const MAX_PRELOAD_DEPTH = 3;
const MAX_PRELOAD_PATHS = 2_500;
const MAX_PRELOAD_PATH_BYTES = 192 * 1024;
const MAX_WARM_WORKSPACE_INDEXES = 8;
export const MAX_WORKSPACE_TEXT_FILE_BYTES = 4 * 1024 * 1024;

/**
 * These directories remain visible but collapsed during adaptive preload. They
 * are ordinary pageable directories after that; none are hidden from the API.
 */
export const DEFAULT_DEFERRED_WORKSPACE_DIRECTORIES: readonly string[] = Object.freeze([
    ".git",
    ".next",
    ".pnpm",
    ".turbo",
    ".yarn",
    ".cache",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
]);

const defaultDeferredDirectories = new Set(DEFAULT_DEFERRED_WORKSPACE_DIRECTORIES);

interface IndexedEntry {
    readonly isDirectory: boolean;
    readonly name: string;
    readonly path: string;
}

interface PreloadQueueEntry {
    readonly depth: number;
    readonly directory: string;
}

interface WorkspaceCursor {
    readonly after: string;
    readonly directory: string;
    readonly gitGeneration: number;
    readonly treeGeneration: number;
}

interface IndexedTextFile extends WorkspaceTextFile {
    readonly fullPath: string;
    readonly mode: number;
}

export class WorkspaceService {
    private readonly indexes = new Map<string, WorkspaceIndex>();
    private readonly indexCreations = new Map<string, Promise<WorkspaceIndex>>();
    private readonly warmIndexes = new Map<string, WorkspaceIndex>();
    private readonly indexesByChat = new Map<string, WorkspaceIndex>();
    private closed = false;

    constructor(
        private readonly repository: CollaborationRepository,
        private readonly pubsub: PubSub,
        private readonly workspacesRoot: string,
        private readonly onError: (error: unknown) => void = () => undefined,
    ) {}

    async getSnapshot(userId: string, chatId: string): Promise<WorkspaceSnapshot> {
        const index = await this.authorizedIndex(userId, chatId);
        return index.preload();
    }

    async getDirectory(input: {
        userId: string;
        chatId: string;
        directory: string;
        cursor?: string;
        limit?: number;
    }): Promise<WorkspaceDirectoryPage> {
        const index = await this.authorizedIndex(input.userId, input.chatId);
        return index.getDirectory({
            directory: canonicalDirectory(input.directory),
            cursor: input.cursor,
            limit: input.limit ?? DEFAULT_DIRECTORY_PAGE_LIMIT,
        });
    }

    async getFile(input: {
        userId: string;
        chatId: string;
        path: string;
    }): Promise<WorkspaceTextFile> {
        const index = await this.authorizedIndex(input.userId, input.chatId);
        return index.getFile(canonicalFilePath(input.path));
    }

    async writeFile(input: {
        userId: string;
        chatId: string;
        path: string;
        expectedVersion: string | null;
        content?: string;
        patch?: WorkspaceTextPatch;
    }): Promise<WorkspaceFileWriteResult> {
        const index = await this.authorizedIndex(input.userId, input.chatId);
        return index.writeFile({
            path: canonicalFilePath(input.path),
            expectedVersion: input.expectedVersion,
            content: input.content,
            patch: input.patch,
        });
    }

    async deleteFile(input: {
        userId: string;
        chatId: string;
        path: string;
        expectedVersion: string;
    }): Promise<WorkspaceFileDeleteResult> {
        const index = await this.authorizedIndex(input.userId, input.chatId);
        return index.deleteFile({
            path: canonicalFilePath(input.path),
            expectedVersion: input.expectedVersion,
        });
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        const creating = [...this.indexCreations.values()];
        const existing = [...this.indexes.values()];
        const created = await Promise.all(
            creating.map((creation) => creation.catch(() => undefined)),
        );
        await Promise.all(
            [...new Set([...existing, ...created.filter((index) => index !== undefined)])].map(
                (index) => index.close(),
            ),
        );
        this.indexes.clear();
        this.indexCreations.clear();
        this.warmIndexes.clear();
        this.indexesByChat.clear();
    }

    private async authorizedIndex(userId: string, chatId: string): Promise<WorkspaceIndex> {
        if (this.closed) throw new Error("Workspace service is closed");
        const target = await this.repository.getChatWorkspaceTarget(userId, chatId);
        const root = await workspaceRoot(target, this.workspacesRoot);
        const existing = this.indexes.get(root);
        if (existing) {
            this.attachChat(target.chatId, existing);
            this.touchWarmIndex(root, existing);
            existing.ensureWatcher();
            existing.warmUp();
            this.coolOldIndexes();
            return existing;
        }
        const pending = this.indexCreations.get(root);
        if (pending) {
            const index = await pending;
            this.attachChat(target.chatId, index);
            this.touchWarmIndex(root, index);
            index.ensureWatcher();
            index.warmUp();
            this.coolOldIndexes();
            return index;
        }
        const creation = (async () => {
            const index = new WorkspaceIndex(root, this.pubsub, this.onError);
            index.attachChat(target.chatId);
            await index.start();
            if (this.closed) {
                await index.close();
                throw new Error("Workspace service is closed");
            }
            this.indexes.set(root, index);
            return index;
        })();
        this.indexCreations.set(root, creation);
        try {
            const index = await creation;
            this.attachChat(target.chatId, index);
            this.touchWarmIndex(root, index);
            this.coolOldIndexes();
            return index;
        } finally {
            this.indexCreations.delete(root);
        }
    }

    private attachChat(chatId: string, index: WorkspaceIndex): void {
        const previous = this.indexesByChat.get(chatId);
        if (previous && previous !== index) previous.detachChat(chatId);
        index.attachChat(chatId);
        this.indexesByChat.set(chatId, index);
    }

    private touchWarmIndex(root: string, index: WorkspaceIndex): void {
        this.warmIndexes.delete(root);
        this.warmIndexes.set(root, index);
    }

    private coolOldIndexes(): void {
        while (this.warmIndexes.size > MAX_WARM_WORKSPACE_INDEXES) {
            const oldest = this.warmIndexes.entries().next().value as
                | [string, WorkspaceIndex]
                | undefined;
            if (!oldest) return;
            this.warmIndexes.delete(oldest[0]);
            oldest[1].cool();
        }
    }
}

class WorkspaceIndex {
    private readonly directoryCache = new Map<string, readonly IndexedEntry[]>();
    private readonly deletedByDirectory = new Map<string, readonly WorkspaceGitStatusEntry[]>();
    private readonly gitStatusByPath = new Map<string, WorkspaceGitStatusEntry>();
    private cachedEntryCount = 0;
    private changeTimer?: NodeJS.Timeout;
    private closed = false;
    private gitGeneration = 0;
    private gitRefreshAgain = false;
    private gitRefreshTask?: Promise<void>;
    private gitStatusPending = true;
    private realRoot = "";
    private readonly revisionId = randomUUID();
    private treeGeneration = 0;
    private watcher?: FSWatcher;
    private changedPaths = new Set<string>();
    private unknownChange = false;
    private warm = true;
    private readonly chatIds = new Set<string>();
    private mutationTail: Promise<void> = Promise.resolve();

    constructor(
        private readonly root: string,
        private readonly pubsub: PubSub,
        private readonly onError: (error: unknown) => void,
    ) {}

    attachChat(chatId: string): void {
        this.chatIds.add(chatId);
    }

    detachChat(chatId: string): void {
        this.chatIds.delete(chatId);
    }

    async start(): Promise<void> {
        this.realRoot = await realpath(this.root);
        this.ensureWatcher();
        this.requestGitRefresh();
    }

    ensureWatcher(): void {
        if (this.closed || this.watcher) return;
        const watcher = watch(this.root, { recursive: true }, (_eventType, filename) => {
            this.queueChange(filename === null ? undefined : String(filename));
        });
        watcher.unref();
        watcher.on("error", (error) => {
            if (this.closed || this.watcher !== watcher) return;
            this.watcher = undefined;
            watcher.close();
            this.onError(error);
            this.unknownChange = true;
            this.flushChanges();
        });
        this.watcher = watcher;
    }

    warmUp(): void {
        if (this.closed || this.warm) return;
        this.warm = true;
        this.gitStatusPending = true;
        this.requestGitRefresh();
    }

    cool(): void {
        if (this.closed || !this.warm) return;
        this.warm = false;
        this.clearDirectoryCache();
        this.deletedByDirectory.clear();
        this.gitStatusByPath.clear();
        this.gitGeneration += 1;
        this.gitStatusPending = true;
    }

    async preload(): Promise<WorkspaceSnapshot> {
        this.ensureWatcher();
        const paths: string[] = [];
        const unloaded = new Set<string>();
        const queue: PreloadQueueEntry[] = [{ depth: 0, directory: "" }];
        let pathBytes = 0;
        let directoriesRead = 0;
        let stopped = false;

        while (queue.length > 0 && !stopped) {
            const current = queue.shift()!;
            if (
                current.directory &&
                defaultDeferredDirectories.has(directoryBasename(current.directory))
            ) {
                unloaded.add(current.directory);
                continue;
            }
            if (directoriesRead >= MAX_PRELOAD_DIRECTORIES) {
                unloaded.add(current.directory);
                for (const queued of queue) unloaded.add(queued.directory);
                break;
            }
            let entries: readonly IndexedEntry[];
            try {
                entries = await this.entriesForDirectory(current.directory);
            } catch (error) {
                if (error instanceof WorkspaceError && error.code === "not_found") continue;
                throw error;
            }
            directoriesRead += 1;
            if (current.directory && entries.length > MAX_EAGER_DIRECTORY_CHILDREN) {
                unloaded.add(current.directory);
                continue;
            }
            for (const entry of entries) {
                const nextBytes = encodedPathBytes(entry.path);
                if (
                    paths.length >= MAX_PRELOAD_PATHS ||
                    pathBytes + nextBytes > MAX_PRELOAD_PATH_BYTES
                ) {
                    unloaded.add(current.directory);
                    for (const queued of queue) unloaded.add(queued.directory);
                    stopped = true;
                    break;
                }
                paths.push(entry.path);
                pathBytes += nextBytes;
                if (!entry.isDirectory) continue;
                if (current.depth + 1 < MAX_PRELOAD_DEPTH)
                    queue.push({ directory: entry.path, depth: current.depth + 1 });
                else unloaded.add(entry.path);
            }
        }

        return this.snapshot(paths, unloaded);
    }

    async getDirectory(input: {
        directory: string;
        cursor?: string;
        limit: number;
    }): Promise<WorkspaceDirectoryPage> {
        this.ensureWatcher();
        const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
        if (
            cursor &&
            (cursor.directory !== input.directory ||
                cursor.treeGeneration !== this.treeGeneration ||
                cursor.gitGeneration !== this.gitGeneration)
        )
            throw new WorkspaceError(
                "stale_cursor",
                "Workspace changed while the directory was being paged",
            );
        const entries = await this.entriesForDirectory(input.directory);
        let index = cursor
            ? entries.findIndex((entry) => comparePaths(entry.name, cursor.after) > 0)
            : 0;
        if (index < 0) index = entries.length;
        const paths: string[] = [];
        const unloaded = new Set<string>();
        let pathBytes = 0;
        while (index < entries.length && paths.length < input.limit) {
            const entry = entries[index]!;
            const nextBytes = encodedPathBytes(entry.path);
            if (paths.length > 0 && pathBytes + nextBytes > DIRECTORY_PAGE_PATH_BYTES) break;
            paths.push(entry.path);
            pathBytes += nextBytes;
            if (entry.isDirectory) unloaded.add(entry.path);
            index += 1;
        }
        const lastEntry = paths.length ? entries[index - 1] : undefined;
        return {
            ...this.snapshot(paths, unloaded),
            directory: input.directory,
            ...(index < entries.length && lastEntry
                ? {
                      nextCursor: encodeCursor({
                          after: lastEntry.name,
                          directory: input.directory,
                          treeGeneration: this.treeGeneration,
                          gitGeneration: this.gitGeneration,
                      }),
                  }
                : {}),
        };
    }

    async getFile(path: string): Promise<WorkspaceTextFile> {
        this.ensureWatcher();
        const file = await this.readTextFile(path);
        return publicTextFile(file);
    }

    async writeFile(input: {
        path: string;
        expectedVersion: string | null;
        content?: string;
        patch?: WorkspaceTextPatch;
    }): Promise<WorkspaceFileWriteResult> {
        return this.mutate(async () => {
            const current = await this.readTextFileIfPresent(input.path);
            assertExpectedVersion(current, input.expectedVersion);
            const nextContent = nextFileContent(current?.content ?? "", input);
            assertTextFileSize(nextContent);
            if (current?.content === nextContent)
                return {
                    path: current.path,
                    size: current.size,
                    version: current.version,
                    created: false,
                };

            await this.replaceTextFile(input.path, nextContent, current);
            const written = await this.readTextFileIfPresent(input.path);
            if (!written || written.content !== nextContent)
                throw workspaceConflict(written?.version ?? null);
            return {
                path: written.path,
                size: written.size,
                version: written.version,
                created: current === undefined,
            };
        });
    }

    async deleteFile(input: {
        path: string;
        expectedVersion: string;
    }): Promise<WorkspaceFileDeleteResult> {
        return this.mutate(async () => {
            const current = await this.readTextFileIfPresent(input.path);
            assertExpectedVersion(current, input.expectedVersion);
            const latest = await this.readTextFileIfPresent(input.path);
            assertExpectedVersion(latest, input.expectedVersion);
            try {
                await unlink(latest!.fullPath);
            } catch (error) {
                if (isMissingPathError(error)) throw workspaceConflict(null);
                throw error;
            }
            return { path: input.path, deletedVersion: input.expectedVersion };
        });
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        if (this.changeTimer) clearTimeout(this.changeTimer);
        this.watcher?.close();
        this.watcher = undefined;
        await this.gitRefreshTask;
        this.directoryCache.clear();
        this.deletedByDirectory.clear();
        this.gitStatusByPath.clear();
        this.cachedEntryCount = 0;
    }

    private async readTextFile(path: string): Promise<IndexedTextFile> {
        const file = await this.readTextFileIfPresent(path);
        if (!file) throw new WorkspaceError("not_found", "Workspace file was not found");
        return file;
    }

    private async readTextFileIfPresent(path: string): Promise<IndexedTextFile | undefined> {
        const fullPath = await this.validatedFilePath(path);
        let handle;
        try {
            handle = await open(fullPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        } catch (error) {
            if (isUnavailableFileError(error)) return undefined;
            throw error;
        }
        try {
            const metadata = await handle.stat({ bigint: true });
            if (!metadata.isFile())
                throw new WorkspaceError("not_found", "Workspace file was not found");
            if (metadata.size > BigInt(MAX_WORKSPACE_TEXT_FILE_BYTES))
                throw new WorkspaceError(
                    "too_large",
                    `Workspace text files are limited to ${MAX_WORKSPACE_TEXT_FILE_BYTES} bytes`,
                );
            const buffer = await handle.readFile();
            if (buffer.byteLength > MAX_WORKSPACE_TEXT_FILE_BYTES)
                throw new WorkspaceError(
                    "too_large",
                    `Workspace text files are limited to ${MAX_WORKSPACE_TEXT_FILE_BYTES} bytes`,
                );
            let content: string;
            try {
                content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
            } catch {
                throw new WorkspaceError("not_text", "Workspace file is not valid UTF-8 text");
            }
            const observedNs =
                metadata.ctimeNs > metadata.mtimeNs ? metadata.ctimeNs : metadata.mtimeNs;
            const hash = createHash("sha256").update(buffer).digest("hex");
            return {
                path,
                content,
                size: buffer.byteLength,
                version: `${observedNs.toString().padStart(20, "0")}.${hash}`,
                fullPath,
                mode: Number(metadata.mode & 0o777n),
            };
        } finally {
            await handle.close();
        }
    }

    private async replaceTextFile(
        path: string,
        content: string,
        current: IndexedTextFile | undefined,
    ): Promise<void> {
        const fullPath = await this.validatedFilePath(path);
        const parent = dirname(fullPath);
        const temporaryPath = join(parent, `.happy2-write-${randomUUID()}.tmp`);
        let temporary: FileHandle | undefined;
        try {
            temporary = await open(
                temporaryPath,
                constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
                current?.mode ?? 0o666,
            );
            await temporary.writeFile(content, "utf8");
            await temporary.sync();
            await temporary.close();
            temporary = undefined;

            const latest = await this.readTextFileIfPresent(path);
            assertExpectedVersion(latest, current?.version ?? null);
            if (!current) {
                try {
                    await link(temporaryPath, fullPath);
                } catch (error) {
                    if (isAlreadyExistsError(error)) {
                        const conflicting = await this.readTextFileIfPresent(path);
                        throw workspaceConflict(conflicting?.version ?? null);
                    }
                    throw error;
                }
                await unlink(temporaryPath);
                return;
            }
            await rename(temporaryPath, fullPath);
        } finally {
            await temporary?.close().catch(() => undefined);
            await unlink(temporaryPath).catch((error) => {
                if (!isMissingPathError(error)) this.onError(error);
            });
        }
    }

    private async validatedFilePath(path: string): Promise<string> {
        const parent = await this.validatedDirectoryPath(parentDirectory(path));
        return join(parent, pathBasename(path));
    }

    private async mutate<T>(action: () => Promise<T>): Promise<T> {
        const previous = this.mutationTail;
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.mutationTail = previous.then(() => current);
        await previous;
        try {
            return await action();
        } finally {
            release();
        }
    }

    private snapshot(paths: readonly string[], unloaded: Set<string>): WorkspaceSnapshot {
        const gitStatus: WorkspaceGitStatusEntry[] = [];
        for (const path of paths) {
            const entry =
                this.gitStatusByPath.get(path) ??
                (path.endsWith("/") ? this.gitStatusByPath.get(path.slice(0, -1)) : undefined);
            if (entry) gitStatus.push(entry.path === path ? entry : { ...entry, path });
        }
        gitStatus.sort((left, right) => comparePaths(left.path, right.path));
        return {
            paths,
            gitStatus,
            revision: `${this.revisionId}.${this.treeGeneration}.${this.gitGeneration}`,
            unloadedDirectories: [...unloaded].sort(comparePaths),
            gitStatusPending: this.gitStatusPending,
        };
    }

    private async entriesForDirectory(directory: string): Promise<readonly IndexedEntry[]> {
        const entries = [...(await this.readDirectory(directory))];
        const known = new Set(entries.map((entry) => entry.path));
        for (const status of this.deletedByDirectory.get(directory) ?? []) {
            if (known.has(status.path)) continue;
            entries.push({
                name: pathBasename(status.path),
                path: status.path,
                isDirectory: status.path.endsWith("/"),
            });
        }
        entries.sort((left, right) => comparePaths(left.name, right.name));
        return entries;
    }

    private async readDirectory(directory: string): Promise<readonly IndexedEntry[]> {
        const cached = this.directoryCache.get(directory);
        if (cached) {
            this.directoryCache.delete(directory);
            this.directoryCache.set(directory, cached);
            return cached;
        }
        const fullPath = await this.validatedDirectoryPath(directory);
        let dirents;
        try {
            dirents = await readdir(fullPath, { withFileTypes: true });
        } catch (error) {
            if (isMissingPathError(error))
                throw new WorkspaceError("not_found", "Workspace directory was not found");
            throw error;
        }
        const entries = dirents
            .map((entry): IndexedEntry => {
                const path = `${directory}${entry.name}${entry.isDirectory() ? "/" : ""}`;
                return { isDirectory: entry.isDirectory(), name: entry.name, path };
            })
            .sort((left, right) => comparePaths(left.name, right.name));
        this.cacheDirectory(directory, entries);
        return entries;
    }

    private async validatedDirectoryPath(directory: string): Promise<string> {
        const segments = directory ? directory.slice(0, -1).split("/") : [];
        const expected = join(this.realRoot, ...segments);
        let metadata;
        try {
            metadata = await lstat(expected);
        } catch (error) {
            if (isMissingPathError(error))
                throw new WorkspaceError("not_found", "Workspace directory was not found");
            throw error;
        }
        if (!metadata.isDirectory() || metadata.isSymbolicLink())
            throw new WorkspaceError("not_found", "Workspace directory was not found");
        const actual = await realpath(expected);
        if (actual !== expected || !isWithinRoot(this.realRoot, actual))
            throw new WorkspaceError("not_found", "Workspace directory was not found");
        return actual;
    }

    private cacheDirectory(directory: string, entries: readonly IndexedEntry[]): void {
        if (entries.length > MAX_CACHED_DIRECTORY_ENTRIES) return;
        const previous = this.directoryCache.get(directory);
        if (previous) {
            this.directoryCache.delete(directory);
            this.cachedEntryCount -= previous.length;
        }
        while (
            this.directoryCache.size > 0 &&
            this.cachedEntryCount + entries.length > MAX_CACHED_DIRECTORY_ENTRIES
        ) {
            const oldest = this.directoryCache.entries().next().value as
                | [string, readonly IndexedEntry[]]
                | undefined;
            if (!oldest) break;
            this.directoryCache.delete(oldest[0]);
            this.cachedEntryCount -= oldest[1].length;
        }
        this.directoryCache.set(directory, entries);
        this.cachedEntryCount += entries.length;
    }

    private queueChange(filename: string | undefined): void {
        if (this.closed) return;
        if (filename === undefined) this.unknownChange = true;
        else this.changedPaths.add(filename);
        if (this.changeTimer) clearTimeout(this.changeTimer);
        this.changeTimer = setTimeout(() => this.flushChanges(), CHANGE_DEBOUNCE_MS);
        this.changeTimer.unref();
    }

    private flushChanges(): void {
        if (this.closed) return;
        if (this.changeTimer) clearTimeout(this.changeTimer);
        this.changeTimer = undefined;
        if (this.unknownChange) this.clearDirectoryCache();
        else for (const path of this.changedPaths) this.invalidatePath(path);
        this.changedPaths.clear();
        this.unknownChange = false;
        this.treeGeneration += 1;
        this.gitStatusPending = true;
        void this.publishChange();
        if (this.warm) this.requestGitRefresh();
    }

    private invalidatePath(nativePath: string): void {
        const normalized = sep === "/" ? nativePath : nativePath.replaceAll(sep, "/");
        if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
            this.clearDirectoryCache();
            return;
        }
        this.removeCachedDirectory(parentDirectory(normalized));
        const possibleDirectory = normalized.endsWith("/") ? normalized : `${normalized}/`;
        for (const directory of this.directoryCache.keys()) {
            if (directory === possibleDirectory || directory.startsWith(possibleDirectory))
                this.removeCachedDirectory(directory);
        }
    }

    private removeCachedDirectory(directory: string): void {
        const entries = this.directoryCache.get(directory);
        if (!entries) return;
        this.directoryCache.delete(directory);
        this.cachedEntryCount -= entries.length;
    }

    private clearDirectoryCache(): void {
        this.directoryCache.clear();
        this.cachedEntryCount = 0;
    }

    private requestGitRefresh(): void {
        if (this.closed || !this.warm) return;
        this.gitStatusPending = true;
        if (this.gitRefreshTask) {
            this.gitRefreshAgain = true;
            return;
        }
        this.gitRefreshTask = (async () => {
            do {
                this.gitRefreshAgain = false;
                const generation = this.treeGeneration;
                const status = await readGitStatus(this.root, this.onError);
                if (this.closed || !this.warm) return;
                if (generation !== this.treeGeneration) {
                    this.gitRefreshAgain = true;
                    continue;
                }
                this.replaceGitStatus(status);
                this.gitGeneration += 1;
            } while (this.gitRefreshAgain && !this.closed);
            if (this.closed) return;
            this.gitStatusPending = false;
            await this.publishChange();
        })()
            .catch(this.onError)
            .finally(() => {
                this.gitRefreshTask = undefined;
                if (this.gitRefreshAgain && !this.closed) this.requestGitRefresh();
            });
    }

    private replaceGitStatus(statuses: readonly WorkspaceGitStatusEntry[]): void {
        this.gitStatusByPath.clear();
        this.deletedByDirectory.clear();
        const deleted = new Map<string, WorkspaceGitStatusEntry[]>();
        for (const status of statuses) {
            this.gitStatusByPath.set(status.path, status);
            if (status.status !== "deleted") continue;
            const directory = parentDirectory(status.path);
            const entries = deleted.get(directory) ?? [];
            entries.push(status);
            deleted.set(directory, entries);
        }
        for (const [directory, entries] of deleted) this.deletedByDirectory.set(directory, entries);
    }

    private publishChange(): Promise<void> {
        if (this.closed) return Promise.resolve();
        const occurredAt = Date.now();
        return Promise.all(
            [...this.chatIds].map((chatId) =>
                this.pubsub
                    .publish(realtimeTopics.chat(chatId), {
                        type: "workspace.changed",
                        chatId,
                        occurredAt,
                    })
                    .catch(this.onError),
            ),
        ).then(() => undefined);
    }
}

async function readGitStatus(
    root: string,
    onError: (error: unknown) => void,
): Promise<WorkspaceGitStatusEntry[]> {
    let output: string;
    try {
        // A mounted workspace is its own filesystem boundary. Do not accidentally
        // inherit a Git repository that contains the server-owned sandbox directory.
        const repositoryPrefix = await gitOutput(root, ["rev-parse", "--show-prefix"]);
        if (repositoryPrefix.trim()) return [];
        output = await gitOutput(root, [
            "status",
            "--porcelain=v2",
            "-z",
            "--untracked-files=all",
            "--ignored=matching",
            "--",
            ".",
        ]);
    } catch (error) {
        if (!isExpectedNoRepositoryError(error)) onError(error);
        return [];
    }
    return parseGitStatus(output);
}

function parseGitStatus(output: string): WorkspaceGitStatusEntry[] {
    const records = output.split("\0");
    const byPath = new Map<string, WorkspaceGitStatus>();
    for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!record) continue;
        if (record.startsWith("? ")) {
            setStatus(byPath, canonicalGitPath(record.slice(2)), "untracked");
            continue;
        }
        if (record.startsWith("! ")) {
            setStatus(byPath, canonicalGitPath(record.slice(2)), "ignored");
            continue;
        }
        if (record.startsWith("1 ")) {
            const match = /^1 (\S{2}) (?:\S+ ){6}([\s\S]+)$/u.exec(record);
            if (match) setStatus(byPath, canonicalGitPath(match[2]!), statusFromXy(match[1]!));
            continue;
        }
        if (record.startsWith("2 ")) {
            const match = /^2 \S{2} (?:\S+ ){7}([\s\S]+)$/u.exec(record);
            if (match) setStatus(byPath, canonicalGitPath(match[1]!), "renamed");
            // Porcelain v2 places the original path in the following NUL record.
            index += 1;
            continue;
        }
        if (record.startsWith("u ")) {
            const match = /^u \S{2} (?:\S+ ){8}([\s\S]+)$/u.exec(record);
            if (match) setStatus(byPath, canonicalGitPath(match[1]!), "modified");
        }
    }
    return [...byPath]
        .map(([path, status]) => ({ path, status }))
        .sort((left, right) => comparePaths(left.path, right.path));
}

function canonicalDirectory(value: string): string {
    if (value === "") return "";
    if (!value.endsWith("/") || value.startsWith("/") || Buffer.byteLength(value) > 16_384)
        throw new WorkspaceError("not_found", "Workspace directory was not found");
    const segments = value.slice(0, -1).split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === ".."))
        throw new WorkspaceError("not_found", "Workspace directory was not found");
    return value;
}

function canonicalFilePath(value: string): string {
    if (!value || value.endsWith("/") || value.startsWith("/") || Buffer.byteLength(value) > 16_384)
        throw new WorkspaceError("not_found", "Workspace file was not found");
    const segments = value.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === ".."))
        throw new WorkspaceError("not_found", "Workspace file was not found");
    return value;
}

function publicTextFile(file: IndexedTextFile): WorkspaceTextFile {
    return {
        path: file.path,
        content: file.content,
        size: file.size,
        version: file.version,
    };
}

function assertExpectedVersion(
    current: IndexedTextFile | undefined,
    expectedVersion: string | null,
): void {
    if (
        (expectedVersion === null && current === undefined) ||
        (expectedVersion !== null && current?.version === expectedVersion)
    )
        return;
    throw workspaceConflict(current?.version ?? null);
}

function workspaceConflict(currentVersion: string | null): WorkspaceError {
    return new WorkspaceError(
        "conflict",
        "Workspace file changed after it was read",
        currentVersion,
    );
}

function nextFileContent(
    current: string,
    input: { readonly content?: string; readonly patch?: WorkspaceTextPatch },
): string {
    if ((input.content === undefined) === (input.patch === undefined))
        throw new WorkspaceError(
            "invalid_patch",
            "Provide exactly one of content or patch when writing a workspace file",
        );
    if (input.content !== undefined) {
        assertValidUnicode(input.content);
        return input.content;
    }
    let position = 0;
    let result = "";
    for (const edit of input.patch!.edits) {
        if (
            !Number.isSafeInteger(edit.start) ||
            !Number.isSafeInteger(edit.end) ||
            edit.start < position ||
            edit.end < edit.start ||
            edit.end > current.length
        )
            throw new WorkspaceError(
                "invalid_patch",
                "Workspace text edits must be sorted, non-overlapping, and within the file",
            );
        assertValidUnicode(edit.text);
        result += current.slice(position, edit.start);
        result += edit.text;
        position = edit.end;
    }
    result += current.slice(position);
    assertValidUnicode(result);
    return result;
}

function assertTextFileSize(content: string): void {
    if (Buffer.byteLength(content) > MAX_WORKSPACE_TEXT_FILE_BYTES)
        throw new WorkspaceError(
            "too_large",
            `Workspace text files are limited to ${MAX_WORKSPACE_TEXT_FILE_BYTES} bytes`,
        );
}

function assertValidUnicode(content: string): void {
    if (Buffer.from(content, "utf8").toString("utf8") !== content)
        throw new WorkspaceError("invalid_patch", "Workspace text must contain valid Unicode");
}

function canonicalGitPath(path: string): string | undefined {
    const normalized = path.replace(/^\.\//u, "");
    if (
        !normalized ||
        normalized.startsWith("/") ||
        normalized === ".." ||
        normalized.startsWith("../") ||
        normalized.includes("/../")
    )
        return undefined;
    return normalized;
}

function statusFromXy(xy: string): WorkspaceGitStatus {
    if (xy.includes("D")) return "deleted";
    if (xy.includes("A")) return "added";
    return "modified";
}

function setStatus(
    statuses: Map<string, WorkspaceGitStatus>,
    path: string | undefined,
    status: WorkspaceGitStatus,
): void {
    if (!path) return;
    const current = statuses.get(path);
    if (!current || statusPriority(status) > statusPriority(current)) statuses.set(path, status);
}

function statusPriority(status: WorkspaceGitStatus): number {
    switch (status) {
        case "deleted":
            return 6;
        case "renamed":
            return 5;
        case "added":
            return 4;
        case "modified":
            return 3;
        case "untracked":
            return 2;
        case "ignored":
            return 1;
    }
}

function encodeCursor(cursor: WorkspaceCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string): WorkspaceCursor {
    try {
        const decoded = JSON.parse(
            Buffer.from(value, "base64url").toString("utf8"),
        ) as Partial<WorkspaceCursor>;
        if (
            typeof decoded.after !== "string" ||
            typeof decoded.directory !== "string" ||
            !Number.isSafeInteger(decoded.treeGeneration) ||
            decoded.treeGeneration! < 0 ||
            !Number.isSafeInteger(decoded.gitGeneration) ||
            decoded.gitGeneration! < 0
        )
            throw new Error("invalid cursor");
        return {
            after: decoded.after,
            directory: decoded.directory,
            treeGeneration: decoded.treeGeneration!,
            gitGeneration: decoded.gitGeneration!,
        };
    } catch {
        throw new WorkspaceError("stale_cursor", "Workspace directory cursor is invalid");
    }
}

function directoryBasename(directory: string): string {
    return pathBasename(directory.slice(0, -1));
}

function parentDirectory(path: string): string {
    const withoutSlash = path.endsWith("/") ? path.slice(0, -1) : path;
    const separator = withoutSlash.lastIndexOf("/");
    return separator < 0 ? "" : `${withoutSlash.slice(0, separator)}/`;
}

function pathBasename(path: string): string {
    const withoutSlash = path.endsWith("/") ? path.slice(0, -1) : path;
    const separator = withoutSlash.lastIndexOf("/");
    return withoutSlash.slice(separator + 1);
}

function comparePaths(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function encodedPathBytes(path: string): number {
    return Buffer.byteLength(JSON.stringify(path)) + 1;
}

function isWithinRoot(root: string, path: string): boolean {
    return path === root || path.startsWith(`${root}${sep}`);
}

function gitOutput(root: string, arguments_: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            "git",
            ["-C", root, ...arguments_],
            {
                encoding: "utf8",
                env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
                maxBuffer: GIT_MAX_BUFFER_BYTES,
                timeout: GIT_TIMEOUT_MS,
                windowsHide: true,
            },
            (error, stdout) => {
                if (error) reject(error);
                else resolve(stdout);
            },
        );
    });
}

function isExpectedNoRepositoryError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: number | string; stderr?: string };
    return (
        candidate.code === 128 ||
        candidate.code === "ENOENT" ||
        candidate.stderr?.includes("not a git repository") === true
    );
}

function isMissingPathError(error: unknown): boolean {
    return Boolean(
        error && typeof error === "object" && (error as { code?: string }).code === "ENOENT",
    );
}

function isUnavailableFileError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    return ["EISDIR", "ELOOP", "ENOENT", "ENOTDIR"].includes(
        String((error as { code?: string }).code),
    );
}

function isAlreadyExistsError(error: unknown): boolean {
    return Boolean(
        error && typeof error === "object" && (error as { code?: string }).code === "EEXIST",
    );
}

async function workspaceRoot(target: ChatWorkspaceTarget, workspacesRoot: string): Promise<string> {
    const cwd =
        target.source === "rig" ? target.cwd : join(workspacesRoot, "channels", target.chatId);
    if (target.source === "channel") await mkdir(cwd, { recursive: true, mode: 0o700 });
    try {
        const root = await realpath(cwd);
        if (!(await lstat(root)).isDirectory())
            throw new WorkspaceError("not_found", "Chat workspace was not found");
        return root;
    } catch (error) {
        if (error instanceof WorkspaceError) throw error;
        if (isMissingPathError(error))
            throw new WorkspaceError("not_found", "Chat workspace was not found");
        throw error;
    }
}

export function workspaceDirectoryPageLimit(value: number | undefined): number {
    if (value === undefined) return DEFAULT_DIRECTORY_PAGE_LIMIT;
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIRECTORY_PAGE_LIMIT)
        throw new RangeError(`limit must be between 1 and ${MAX_DIRECTORY_PAGE_LIMIT}`);
    return value;
}
