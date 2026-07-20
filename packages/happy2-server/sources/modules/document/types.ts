/**
 * Collaborative documents store editor-agnostic Yjs state: an append-only log of
 * opaque base64 updates per document plus a compacted snapshot. The server never
 * interprets document content; the `format` field only tells clients which editor
 * binding to construct.
 */

export const DOCUMENT_FORMATS = ["blocknote"] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export interface DocumentSummary {
    readonly id: string;
    readonly chatId: string;
    readonly title: string;
    readonly format: DocumentFormat;
    readonly createdByUserId?: string;
    /** Sequence of the newest accepted update, as an unsigned decimal string. */
    readonly latestSequence: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

/** A merged base64 Yjs update covering the document up to `sequence`. */
export interface DocumentSnapshot {
    readonly update: string;
    readonly sequence: string;
}

export interface DocumentUpdateEntry {
    readonly sequence: string;
    readonly update: string;
}

export interface DocumentDifference {
    readonly document: DocumentSummary;
    /** Present when the caller's cursor predates the compacted snapshot floor. */
    readonly snapshot?: DocumentSnapshot;
    readonly updates: readonly DocumentUpdateEntry[];
    readonly latestSequence: string;
    readonly hasMore: boolean;
}

/** Decoded size cap for one client-sent Yjs update. */
export const MAX_DOCUMENT_UPDATE_BYTES = 256 * 1024;
/** Update count cap for one applyUpdates batch. */
export const MAX_DOCUMENT_UPDATE_BATCH = 64;
/** Total decoded size cap for one applyUpdates batch. */
export const MAX_DOCUMENT_BATCH_BYTES = 700 * 1024;
/** Merge the update log into the snapshot after this many accepted batches. */
export const DOCUMENT_COMPACTION_INTERVAL = 64;
/** Keep this many trailing update rows for idempotent replay detection. */
export const DOCUMENT_UPDATE_RETENTION = 256;
export const MAX_DOCUMENT_TITLE_LENGTH = 200;
export const DOCUMENT_DIFFERENCE_DEFAULT_LIMIT = 100;
export const DOCUMENT_DIFFERENCE_MAX_LIMIT = 200;
export const DOCUMENT_PRESENCE_DEFAULT_TTL_MS = 15_000;
