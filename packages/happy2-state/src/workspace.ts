import type { WorkspaceListing } from "./api.js";
import type { ClientWorkspace, WorkspaceGitStatusEntry } from "./types.js";

export interface WorkspaceDirectoryRecord {
    readonly pages: readonly WorkspaceListing[];
}

export interface WorkspaceRecord {
    readonly initial: WorkspaceListing;
    readonly initialEtag?: string;
    readonly revision: string;
    readonly requestedDirectories: readonly string[];
    readonly directories: ReadonlyMap<string, WorkspaceDirectoryRecord>;
}

export function createWorkspaceRecord(
    initial: WorkspaceListing,
    initialEtag?: string,
): WorkspaceRecord {
    return {
        initial,
        initialEtag,
        revision: initial.revision,
        requestedDirectories: [],
        directories: new Map(),
    };
}

export function setWorkspaceRequestedDirectories(
    current: WorkspaceRecord,
    requestedDirectories: readonly string[],
): WorkspaceRecord {
    return { ...current, requestedDirectories };
}

export function replaceWorkspaceInitial(
    current: WorkspaceRecord,
    initial: WorkspaceListing,
    initialEtag: string | undefined,
    directories = current.directories,
): WorkspaceRecord {
    return {
        initial,
        initialEtag,
        revision: latestRevision(initial, directories),
        requestedDirectories: current.requestedDirectories,
        directories,
    };
}

export function setWorkspaceDirectory(
    current: WorkspaceRecord,
    directory: string,
    value: WorkspaceDirectoryRecord,
): WorkspaceRecord {
    const directories = new Map(current.directories);
    directories.set(directory, value);
    return {
        ...current,
        revision: value.pages.at(-1)?.revision ?? current.revision,
        directories,
    };
}

export function removeWorkspaceDirectory(
    current: WorkspaceRecord,
    directory: string,
): WorkspaceRecord {
    const directories = new Map(current.directories);
    directories.delete(directory);
    return { ...current, directories, revision: latestRevision(current.initial, directories) };
}

export function clientWorkspace(chatId: string, record: WorkspaceRecord): ClientWorkspace {
    const paths = new Set<string>();
    const statuses = new Map<string, WorkspaceGitStatusEntry>();
    const unloaded = new Set<string>();
    let gitStatusPending = false;

    const include = (listing: WorkspaceListing): void => {
        for (const path of listing.paths) paths.add(path);
        for (const path of listing.paths) statuses.delete(path);
        for (const status of listing.gitStatus) statuses.set(status.path, status);
        for (const directory of listing.unloadedDirectories) unloaded.add(directory);
        gitStatusPending ||= listing.gitStatusPending;
    };
    include(record.initial);
    for (const value of record.directories.values()) for (const page of value.pages) include(page);

    const directories = [...record.directories]
        .map(([directory, value]) => {
            const loadedPaths = new Set(value.pages.flatMap((page) => page.paths));
            const complete = value.pages.at(-1)?.nextCursor === undefined;
            if (complete) unloaded.delete(directory);
            else unloaded.add(directory);
            return {
                directory,
                loadedPathCount: loadedPaths.size,
                pageCount: value.pages.length,
                complete,
            };
        })
        .sort((left, right) => compare(left.directory, right.directory));

    const visiblePaths = [...paths].sort(compare);
    return {
        chatId,
        requestedDirectories: [...record.requestedDirectories],
        paths: visiblePaths,
        gitStatus: [...statuses.values()]
            .filter((status) => paths.has(status.path))
            .sort((left, right) => compare(left.path, right.path)),
        revision: record.revision,
        unloadedDirectories: [...unloaded].sort(compare),
        gitStatusPending,
        directories,
    };
}

function latestRevision(
    initial: WorkspaceListing,
    directories: ReadonlyMap<string, WorkspaceDirectoryRecord>,
): string {
    let revision = initial.revision;
    for (const directory of directories.values())
        revision = directory.pages.at(-1)?.revision ?? revision;
    return revision;
}

function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
