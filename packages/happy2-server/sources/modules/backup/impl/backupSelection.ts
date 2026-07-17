import { backupRecords } from "../../schema.js";
export const backupSelection = {
    id: backupRecords.id,
    storage_provider: backupRecords.storageProvider,
    storage_key: backupRecords.storageKey,
    checksum_sha256: backupRecords.checksumSha256,
    size: backupRecords.size,
    status: backupRecords.status,
    created_by_user_id: backupRecords.createdByUserId,
    metadata_json: backupRecords.metadataJson,
    last_error: backupRecords.lastError,
    created_at: backupRecords.createdAt,
    completed_at: backupRecords.completedAt,
    retention_until: backupRecords.retentionUntil,
};
