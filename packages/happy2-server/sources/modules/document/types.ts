/**
 * Collaborative documents store editor-agnostic Yjs state: an append-only log of
 * opaque base64 updates per document plus a compacted snapshot. The server never
 * interprets document content; the `format` field only tells clients which editor
 * binding to construct.
 */

import type { FileSummary } from "../chat/types.js";

export const DOCUMENT_FORMATS = ["blocknote"] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export interface DocumentChannelAttachment {
    readonly chatId: string;
    readonly attachedByUserId: string;
    readonly attachedAt: string;
}

export interface DocumentFileAttachment {
    readonly file: FileSummary;
    readonly position: number;
    readonly attachedByUserId: string;
    readonly createdAt: string;
}

export interface DocumentSummary {
    readonly id: string;
    readonly ownerUserId: string;
    readonly title: string;
    readonly format: DocumentFormat;
    /** Attachments visible to the caller; owners see every attachment. */
    readonly channelAttachments: readonly DocumentChannelAttachment[];
    /** Durable files attached directly to this document in display order. */
    readonly fileAttachments: readonly DocumentFileAttachment[];
    /** Sequence of the newest accepted update, as an unsigned decimal string. */
    readonly latestSequence: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface DocumentRealtimeAudience {
    readonly ownerUserId: string;
    readonly ownerNeedsUserTopic: boolean;
    readonly chatIds: readonly string[];
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

export type DocumentWriteRequestStatus = "pending" | "approved" | "denied" | "failed";

export interface DocumentWriteRequestSummary {
    readonly id: string;
    readonly status: DocumentWriteRequestStatus;
    readonly chatId: string;
    readonly actorUserId?: string;
    readonly agentUserId?: string;
    readonly requesterInstallationId?: string;
    readonly documentId: string;
    readonly documentTitle: string;
    readonly clientUpdateId: string;
    readonly baseSequence: string;
    readonly acceptedSequence?: string;
    readonly resolvedByUserId?: string;
    readonly resolvedAt?: string;
    readonly expiresAt: string;
    readonly lastError?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface DocumentHostSummary {
    readonly id: string;
    readonly title: string;
    readonly format: DocumentFormat;
    readonly latestSequence: string;
    readonly updatedAt: string;
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
/** A staged agent document write fails if no chat member decides it within five minutes. */
export const DOCUMENT_WRITE_APPROVAL_TIMEOUT_MS = 5 * 60_000;
