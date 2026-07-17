import { type ActiveSession } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, authSessions } from "../schema.js";
import { and, eq, gt, isNull } from "drizzle-orm";
import { asSession } from "./impl/asSession.js";

/**
 * Resolves an unrevoked, unexpired authSessions row only while its account has not been banned or deleted.
 * Rechecking durable session and account authority on every lookup prevents a valid JWT from surviving server-side revocation or account removal.
 */
export async function sessionFindActive(
    executor: DrizzleExecutor,
    id: string,
): Promise<ActiveSession | undefined> {
    const [row] = await executor
        .select({
            id: authSessions.id,
            accountId: authSessions.accountId,
            expiresAt: authSessions.expiresAt,
        })
        .from(authSessions)
        .innerJoin(accounts, eq(accounts.id, authSessions.accountId))
        .where(
            and(
                eq(authSessions.id, id),
                isNull(authSessions.revokedAt),
                gt(authSessions.expiresAt, new Date().toISOString()),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    return row ? asSession(row) : undefined;
}
