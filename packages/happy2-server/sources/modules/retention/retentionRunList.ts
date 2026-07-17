import { type DrizzleExecutor } from "../drizzle.js";
import { type Page, type RetentionRun, type RetentionScope } from "../operations/types.js";

import { and, desc, eq, type SQL } from "drizzle-orm";

import { asRetention } from "./impl/asRetention.js";
import { cursorCondition } from "../operations/cursorCondition.js";
import { decodeCursor } from "../operations/decodeCursor.js";

import { page } from "../operations/page.js";
import { retentionRuns } from "../schema.js";
import { retentionSelection } from "./impl/retentionSelection.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Returns an administrator-only reverse-chronological page of retention runs, optionally filtered by scope and continued before a start-time cursor.
 * The shared page projection exposes durable cleanup outcomes without allowing ordinary users to inspect server policy execution.
 */
export async function retentionRunList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        scope?: RetentionScope;
        before?: string;
        limit: number;
    },
): Promise<Page<RetentionRun>> {
    await userRequireOperationsAdmin(executor, input.actorUserId);
    const conditions: SQL[] = [];
    if (input.scope) conditions.push(eq(retentionRuns.scope, input.scope));
    const cursor = decodeCursor(input.before);
    if (cursor) conditions.push(cursorCondition(retentionRuns.startedAt, retentionRuns.id, cursor));
    const rows = await executor
        .select(retentionSelection)
        .from(retentionRuns)
        .where(and(...conditions))
        .orderBy(desc(retentionRuns.startedAt), desc(retentionRuns.id))
        .limit(input.limit + 1);
    return page(rows, input.limit, asRetention, (item) => item.startedAt);
}
