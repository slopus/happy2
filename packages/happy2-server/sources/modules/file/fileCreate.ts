import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type StoredFile } from "./types.js";
import { createId } from "@paralleldrive/cuid2";
import { files, fileScanEvents } from "../schema.js";

import { sql } from "drizzle-orm";

/**
 * Registers uploaded object metadata in files and records the initial fileScanEvents state that governs whether it may be served.
 * Creating metadata and scan history together prevents an unscanned object from appearing as a normal accessible file.
 */
export async function fileCreate(
    executor: DrizzleExecutor,
    file: StoredFile,
    scan: {
        status: "clean" | "failed" | "skipped";
        result?: unknown;
    } = {
        status: "skipped",
    },
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        await tx.insert(files).values({
            id: file.id,
            userId: file.userId,
            uploadedByUserId: file.uploadedByUserId,
            isPublic: file.isPublic ? 1 : 0,
            storageName: file.storageName,
            contentType: file.contentType,
            size: file.size,
            width: file.width,
            height: file.height,
            thumbhash: file.thumbhash,
            kind: file.kind,
            originalName: file.originalName ?? null,
            durationMs: file.durationMs ?? null,
            scanStatus: scan.status,
            scannedAt: sql`CURRENT_TIMESTAMP`,
            scanResultJson: scan.result === undefined ? null : JSON.stringify(scan.result),
        });
        await tx.insert(fileScanEvents).values({
            id: createId(),
            fileId: file.id,
            scanner: "upload_policy",
            status: scan.status,
            resultJson: scan.result === undefined ? null : JSON.stringify(scan.result),
        });
    });
}
