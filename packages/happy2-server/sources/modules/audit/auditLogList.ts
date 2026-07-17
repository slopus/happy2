import { type AuditLogEntry, type Page } from "../operations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, desc, eq, type SQL } from "drizzle-orm";

import { asAudit } from "../operations/asAudit.js";
import { auditLogEntries } from "../schema.js";
import { auditSelection } from "../operations/auditSelection.js";
import { cursorCondition } from "../operations/cursorCondition.js";
import { decodeCursor } from "../operations/decodeCursor.js";

import { page } from "../operations/page.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Returns an administrator-only reverse-chronological audit page filtered by action, target, actor, and an exclusive created-at/id cursor.
 * Fetching one extra row through the shared page mapper produces a stable continuation token without exposing audit history to ordinary users.
 */
export async function auditLogList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        action?: string;
        targetType?: string;
        targetId?: string;
        auditedActorUserId?: string;
        before?: string;
        limit: number;
    },
): Promise<Page<AuditLogEntry>> {
    await userRequireOperationsAdmin(executor, input.actorUserId);
    const cursor = decodeCursor(input.before);
    const conditions: SQL[] = [];
    if (input.action) conditions.push(eq(auditLogEntries.action, input.action));
    if (input.targetType) conditions.push(eq(auditLogEntries.targetType, input.targetType));
    if (input.targetId) conditions.push(eq(auditLogEntries.targetId, input.targetId));
    if (input.auditedActorUserId)
        conditions.push(eq(auditLogEntries.actorUserId, input.auditedActorUserId));
    if (cursor)
        conditions.push(cursorCondition(auditLogEntries.createdAt, auditLogEntries.id, cursor));
    const rows = await executor
        .select(auditSelection)
        .from(auditLogEntries)
        .where(and(...conditions))
        .orderBy(desc(auditLogEntries.createdAt), desc(auditLogEntries.id))
        .limit(input.limit + 1);
    return page(rows, input.limit, asAudit);
}
