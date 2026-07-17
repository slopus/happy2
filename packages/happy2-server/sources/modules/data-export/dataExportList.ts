import {
    type DataExportJob,
    type DataExportStatus,
    OperationsError,
    type Page,
} from "../operations/types.js";

import { type DrizzleExecutor } from "../drizzle.js";

import { and, desc, eq, type SQL } from "drizzle-orm";

import { asExport } from "./impl/asExport.js";
import { cursorCondition } from "../operations/cursorCondition.js";
import { dataExportJobs } from "../schema.js";
import { decodeCursor } from "../operations/decodeCursor.js";

import { exportSelection } from "./impl/exportSelection.js";
import { page } from "../operations/page.js";
import { userRequireOperationsActive } from "../operations/userRequireOperationsActive.js";
/**
 * Returns a reverse-chronological export-job page for the active requester's own jobs or, for administrators, jobs filtered by requester and status.
 * Enforcing ownOnly before query construction prevents ordinary users from broadening the operations listing through optional filters.
 */
export async function dataExportList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        status?: DataExportStatus;
        requestedByUserId?: string;
        before?: string;
        limit: number;
        ownOnly?: boolean;
    },
): Promise<Page<DataExportJob>> {
    const actor = await userRequireOperationsActive(executor, input.actorUserId);
    if (!input.ownOnly && actor.role !== "admin")
        throw new OperationsError("forbidden", "Administrator access is required");
    const conditions: SQL[] = [];
    if (input.ownOnly) conditions.push(eq(dataExportJobs.requestedByUserId, input.actorUserId));
    else if (input.requestedByUserId)
        conditions.push(eq(dataExportJobs.requestedByUserId, input.requestedByUserId));
    if (input.status) conditions.push(eq(dataExportJobs.status, input.status));
    const cursor = decodeCursor(input.before);
    if (cursor)
        conditions.push(cursorCondition(dataExportJobs.createdAt, dataExportJobs.id, cursor));
    const rows = await executor
        .select(exportSelection)
        .from(dataExportJobs)
        .where(and(...conditions))
        .orderBy(desc(dataExportJobs.createdAt), desc(dataExportJobs.id))
        .limit(input.limit + 1);
    return page(rows, input.limit, asExport);
}
