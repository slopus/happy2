export type WorkspaceGitStatus =
    | "added"
    | "deleted"
    | "ignored"
    | "modified"
    | "renamed"
    | "untracked";

export interface WorkspaceGitStatusEntry {
    readonly path: string;
    readonly status: WorkspaceGitStatus;
}

export interface WorkspaceSnapshot {
    /** Canonical Trees paths. Directory paths end in a slash. */
    readonly paths: readonly string[];
    /** Direct input for @pierre/trees' gitStatus option. */
    readonly gitStatus: readonly WorkspaceGitStatusEntry[];
    /** Process-local identity for the indexed tree and Git annotations. */
    readonly revision: string;
    /** Directories present in paths whose children must be requested lazily. */
    readonly unloadedDirectories: readonly string[];
    /** True until the asynchronously initialized Git annotations are current. */
    readonly gitStatusPending: boolean;
}

export interface WorkspaceDirectoryPage extends WorkspaceSnapshot {
    /** Canonical directory whose direct children are represented by paths. Empty means root. */
    readonly directory: string;
    /** Opaque continuation for another page of this same directory and tree generation. */
    readonly nextCursor?: string;
}

export class WorkspaceError extends Error {
    constructor(
        readonly code: "not_found" | "stale_cursor",
        message: string,
    ) {
        super(message);
        this.name = "WorkspaceError";
    }
}
