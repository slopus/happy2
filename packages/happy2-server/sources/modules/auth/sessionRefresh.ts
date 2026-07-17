import { type ActiveSession, type RequestMetadata } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accounts, authSessions } from "../schema.js";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { asSession } from "./impl/asSession.js";

import { recordSessionEvent } from "./impl/recordSessionEvent.js";

/**
 * Extends the expiry and last-seen timestamp of an unrevoked authSessions row whose account remains eligible, then records refresh telemetry.
 * The transaction keeps the sliding-expiry update and its security event together; it deliberately does not rotate or replace the session identifier.
 */
export async function sessionRefresh(
    executor: DrizzleExecutor,
    id: string,
    expiresAt: Date,
    metadata: RequestMetadata,
): Promise<ActiveSession | undefined> {
    return withTransaction(executor, async (tx) => {
        const activeAccount = tx
            .select({
                id: accounts.id,
            })
            .from(accounts)
            .where(
                and(
                    eq(accounts.id, authSessions.accountId),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        const [session] = await tx
            .update(authSessions)
            .set({
                expiresAt: expiresAt.toISOString(),
                lastSeenAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(authSessions.id, id),
                    isNull(authSessions.revokedAt),
                    gt(authSessions.expiresAt, new Date().toISOString()),
                    sql`exists ${activeAccount}`,
                ),
            )
            .returning({
                id: authSessions.id,
                accountId: authSessions.accountId,
                expiresAt: authSessions.expiresAt,
            });
        if (!session) return undefined;
        await recordSessionEvent(tx, id, "refreshed", metadata);
        return asSession(session);
    });
}
