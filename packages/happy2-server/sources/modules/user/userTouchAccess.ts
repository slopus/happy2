import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, authSessions, users } from "../schema.js";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

/**
 * Best-effort updates authSessions.lastSeenAt and users.lastAccessAt when their independent lifecycle minute guards allow a touch.
 * The independent telemetry writes intentionally swallow failure and need no cross-row transaction because neither timestamp authorizes the request.
 */
export async function userTouchAccess(
    executor: DrizzleExecutor,
    sessionId: string | undefined,
    userId: string,
): Promise<void> {
    try {
        if (sessionId) {
            const activeSessionAccount = executor
                .select({
                    id: accounts.id,
                })
                .from(accounts)
                .where(
                    and(
                        eq(accounts.id, authSessions.accountId),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            await executor
                .update(authSessions)
                .set({
                    lastSeenAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(authSessions.id, sessionId),
                        isNull(authSessions.revokedAt),
                        sql`exists ${activeSessionAccount}`,
                        or(
                            isNull(authSessions.lastSeenAt),
                            lt(authSessions.lastSeenAt, sql`datetime('now', '-1 minute')`),
                        ),
                    ),
                );
        }
        await executor
            .update(users)
            .set({
                lastAccessAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(users.id, userId),
                    eq(users.active, 1),
                    isNull(users.deletedAt),
                    or(
                        isNull(users.lastAccessAt),
                        lt(users.lastAccessAt, sql`datetime('now', '-1 minute')`),
                    ),
                ),
            );
    } catch {
        // Last-access telemetry must not turn a valid authenticated request into a failure.
    }
}
