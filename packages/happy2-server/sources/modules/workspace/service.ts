import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import type { CollaborationRepository } from "../collaboration/repository.js";
import { realtimeTopics, type PubSub } from "../realtime/index.js";
import {
    WorkspaceError,
    type WorkspaceDirectoryPage,
    type WorkspaceGitStatus,
    type WorkspaceGitStatusEntry,
    type WorkspaceSnapshot,
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

export class WorkspaceService {
    private readonly indexes = new Map<string, WorkspaceIndex>();
    private readonly indexCreations = new Map<string, Promise<WorkspaceIndex>>();
    private readonly warmIndexes = new Map<string, WorkspaceIndex>();
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
    }

    private async authorizedIndex(userId: string, chatId: string): Promise<WorkspaceIndex> {
        if (this.closed) throw new Error("Workspace service is closed");
        const chat = await this.repository.getWorkspaceChannel(userId, chatId);
        const existing = this.indexes.get(chat.id);
        if (existing) {
            this.touchWarmIndex(chat.id, existing);
            existing.ensureWatcher();
            existing.warmUp();
            this.coolOldIndexes();
            return existing;
        }
        const pending = this.indexCreations.get(chat.id);
        if (pending) return pending;
        const creation = (async () => {
            const directory = join(this.workspacesRoot, "channels", chat.id);
            await mkdir(directory, { recursive: true, mode: 0o700 });
            const index = new WorkspaceIndex(chat.id, directory, this.pubsub, this.onError);
            await index.start();
            if (this.closed) {
                await index.close();
                throw new Error("Workspace service is closed");
            }
            this.indexes.set(chat.id, index);
            this.touchWarmIndex(chat.id, index);
            this.coolOldIndexes();
            return index;
        })();
        this.indexCreations.set(chat.id, creation);
        try {
            return await creation;
        } finally {
            this.indexCreations.delete(chat.id);
        }
    }

    private touchWarmIndex(chatId: string, index: WorkspaceIndex): void {
        this.warmIndexes.delete(chatId);
        this.warmIndexes.set(chatId, index);
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

    constructor(
        private readonly chatId: string,
        private readonly root: string,
        private readonly pubsub: PubSub,
        private readonly onError: (error: unknown) => void,
    ) {}

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
        return this.pubsub
            .publish(realtimeTopics.chat(this.chatId), {
                type: "workspace.changed",
                chatId: this.chatId,
                occurredAt: Date.now(),
            })
            .catch(this.onError);
    }
}

async function readGitStatus(
    root: string,
    onError: (error: unknown) => void,
): Promise<WorkspaceGitStatusEntry[]> {
    let output: string;
    try {
        // A channel is its own filesystem boundary. Do not accidentally inherit a Git
        // repository that contains the configured workspaces directory.
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

export function workspaceDirectoryPageLimit(value: number | undefined): number {
    if (value === undefined) return DEFAULT_DIRECTORY_PAGE_LIMIT;
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIRECTORY_PAGE_LIMIT)
        throw new RangeError(`limit must be between 1 and ${MAX_DIRECTORY_PAGE_LIMIT}`);
    return value;
}
