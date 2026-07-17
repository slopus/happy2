import { type BackupRecord, type BackupStatus } from "../../operations/types.js";

import { optionalNumber } from "./optionalNumber.js";
import { optionalText } from "../../operations/optionalText.js";
import { parseJson } from "../../operations/parseJson.js";
import { text } from "../../operations/text.js";
export function asBackup(row: Record<string, unknown>): BackupRecord {
    return {
        id: text(row.id),
        storageProvider: text(row.storage_provider),
        storageKey: text(row.storage_key),
        checksumSha256: optionalText(row.checksum_sha256),
        size: optionalNumber(row.size),
        status: text(row.status) as BackupStatus,
        createdByUserId: optionalText(row.created_by_user_id),
        metadata: parseJson(row.metadata_json),
        lastError: optionalText(row.last_error),
        createdAt: text(row.created_at),
        completedAt: optionalText(row.completed_at),
        retentionUntil: optionalText(row.retention_until),
    };
}
