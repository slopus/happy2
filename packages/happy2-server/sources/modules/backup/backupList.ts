import { type BackupRecord, type BackupStatus, type Page } from "../operations/types.js";

import { type DrizzleExecutor } from "../drizzle.js";

import { and, desc, eq, type SQL } from "drizzle-orm";

import { asBackup } from "./impl/asBackup.js";
import { backupRecords } from "../schema.js";
import { backupSelection } from "./impl/backupSelection.js";
import { cursorCondition } from "../operations/cursorCondition.js";
import { decodeCursor } from "../operations/decodeCursor.js";

import { page } from "../operations/page.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Returns an administrator-only reverse-chronological page of backup records, optionally filtered by status and an exclusive cursor.
 * Loading one row beyond the requested limit yields stable continuation metadata while preserving the operations authorization boundary.
 */
export async function backupList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        status?: BackupStatus;
        before?: string;
        limit: number;
    },
): Promise<Page<BackupRecord>> {
    await userRequireOperationsAdmin(executor, input.actorUserId);
    const conditions: SQL[] = [];
    if (input.status) conditions.push(eq(backupRecords.status, input.status));
    const cursor = decodeCursor(input.before);
    if (cursor) conditions.push(cursorCondition(backupRecords.createdAt, backupRecords.id, cursor));
    const rows = await executor
        .select(backupSelection)
        .from(backupRecords)
        .where(and(...conditions))
        .orderBy(desc(backupRecords.createdAt), desc(backupRecords.id))
        .limit(input.limit + 1);
    return page(rows, input.limit, asBackup);
}
