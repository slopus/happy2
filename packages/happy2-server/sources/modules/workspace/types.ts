export type ChatWorkspaceTarget =
    | { chatId: string; source: "channel" }
    | { chatId: string; source: "rig"; cwd: string };

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

/** One UTF-8 text file as observed at a conflict-detectable filesystem version. */
export interface WorkspaceTextFile {
    readonly path: string;
    readonly content: string;
    readonly size: number;
    /** Opaque equality token. A different value means the file changed. */
    readonly version: string;
}

export interface WorkspaceHashedTextFile extends WorkspaceTextFile {
    /** SHA-256 of the exact UTF-8 file bytes. */
    readonly sha256: string;
}

export interface WorkspaceTextEdit {
    /** UTF-16 string offset, matching JavaScript editor coordinates. */
    readonly start: number;
    /** Exclusive UTF-16 string offset. */
    readonly end: number;
    readonly text: string;
}

export interface WorkspaceTextPatch {
    /** Sorted, non-overlapping edits against the supplied expectedVersion. */
    readonly edits: readonly WorkspaceTextEdit[];
}

export interface WorkspaceFileWriteResult {
    readonly path: string;
    readonly size: number;
    readonly version: string;
    readonly created: boolean;
}

export interface WorkspaceHashedFileWriteResult extends WorkspaceFileWriteResult {
    readonly sha256: string;
}

export interface WorkspaceCommandResult {
    readonly command: string;
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly timedOut: boolean;
    /** True when either output stream exceeded the bounded capture size. */
    readonly outputLimitExceeded: boolean;
}

export interface WorkspaceFileDeleteResult {
    readonly path: string;
    readonly deletedVersion: string;
}

export class WorkspaceError extends Error {
    constructor(
        readonly code:
            | "not_found"
            | "stale_cursor"
            | "conflict"
            | "invalid_patch"
            | "not_text"
            | "too_large",
        message: string,
        readonly currentVersion?: string | null,
    ) {
        super(message);
        this.name = "WorkspaceError";
    }
}
