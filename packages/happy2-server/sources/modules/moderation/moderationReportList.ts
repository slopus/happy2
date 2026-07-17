import { type DrizzleExecutor } from "../drizzle.js";
import {
    type ModerationReport,
    type ModerationReportStatus,
    type Page,
} from "../operations/types.js";

import { and, desc, eq, type SQL } from "drizzle-orm";

import { asReport } from "./impl/asReport.js";
import { cursorCondition } from "../operations/cursorCondition.js";
import { decodeCursor } from "../operations/decodeCursor.js";

import { moderationReports } from "../schema.js";
import { page } from "../operations/page.js";
import { reportSelection } from "./impl/reportSelection.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Returns an administrator-only reverse-chronological report page filtered by status, assignee, and an exclusive created-at/id cursor.
 * Loading one extra report through the shared mapper provides stable continuation metadata for the moderation queue.
 */
export async function moderationReportList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        status?: ModerationReportStatus;
        assignedToUserId?: string;
        before?: string;
        limit: number;
    },
): Promise<Page<ModerationReport>> {
    await userRequireOperationsAdmin(executor, input.actorUserId);
    const cursor = decodeCursor(input.before);
    const conditions: SQL[] = [];
    if (input.status) conditions.push(eq(moderationReports.status, input.status));
    if (input.assignedToUserId)
        conditions.push(eq(moderationReports.assignedToUserId, input.assignedToUserId));
    if (cursor)
        conditions.push(cursorCondition(moderationReports.createdAt, moderationReports.id, cursor));
    const rows = await executor
        .select(reportSelection)
        .from(moderationReports)
        .where(and(...conditions))
        .orderBy(desc(moderationReports.createdAt), desc(moderationReports.id))
        .limit(input.limit + 1);
    return page(rows, input.limit, asReport);
}
