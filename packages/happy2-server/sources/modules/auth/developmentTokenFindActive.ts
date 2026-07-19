import { and, eq, gt, isNull } from "drizzle-orm";
import { accounts, authDevTokens, authSessions } from "../schema.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { tokenHash } from "./impl/tokenHash.js";
import { asSession } from "./impl/asSession.js";
import type { ActiveSession } from "./types.js";

/**
 * Resolves an opaque development credential only while its linked session and account remain active.
 * The joined durable lookup is the authority boundary that makes logout, expiry, bans, and account deletion invalidate exported authentication immediately.
 */
export async function developmentTokenFindActive(
    executor: DrizzleExecutor,
    token: string,
): Promise<ActiveSession | undefined> {
    const [row] = await executor
        .select({
            id: authSessions.id,
            accountId: authSessions.accountId,
            expiresAt: authSessions.expiresAt,
        })
        .from(authDevTokens)
        .innerJoin(authSessions, eq(authSessions.id, authDevTokens.sessionId))
        .innerJoin(accounts, eq(accounts.id, authSessions.accountId))
        .where(
            and(
                eq(authDevTokens.tokenHash, tokenHash(token)),
                isNull(authSessions.revokedAt),
                gt(authSessions.expiresAt, new Date().toISOString()),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    return row ? asSession(row) : undefined;
}
