import { type FileKind, type StoredFile } from "../types.js";
import { type FileRow } from "./fileRow.js";

export function asFile(row: FileRow): StoredFile {
    if (!row.uploadedByUserId) throw new Error("Stored file is missing its uploader");
    return {
        id: row.id,
        userId: row.userId,
        uploadedByUserId: row.uploadedByUserId,
        isPublic: row.isPublic === 1,
        storageName: row.storageName,
        contentType: row.contentType,
        size: row.size,
        width: row.width,
        height: row.height,
        thumbhash: row.thumbhash,
        kind: row.kind as FileKind,
        originalName: row.originalName ?? undefined,
        durationMs: row.durationMs ?? undefined,
    };
}
