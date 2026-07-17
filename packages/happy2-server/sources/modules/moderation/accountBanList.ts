import { type AccountBan, type Page } from "../operations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, desc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { accountBans, users } from "../schema.js";

import { asBan } from "./impl/asBan.js";
import { banSelection } from "./impl/banSelection.js";
import { cursorCondition } from "../operations/cursorCondition.js";
import { decodeCursor } from "../operations/decodeCursor.js";

import { page } from "../operations/page.js";

import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Returns an administrator-only reverse-chronological page of bans filtered by target user and active, expired, or revoked state.
 * Computing lifecycle status against one request timestamp and a banned-at/id cursor keeps pagination stable around expiry boundaries.
 */
export async function accountBanList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        targetUserId?: string;
        status?: "active" | "expired" | "revoked";
        before?: string;
        limit: number;
    },
): Promise<Page<AccountBan>> {
    await userRequireOperationsAdmin(executor, input.actorUserId);
    const cursor = decodeCursor(input.before);
    const conditions: SQL[] = [];
    if (input.targetUserId) conditions.push(eq(users.id, input.targetUserId));
    const now = new Date().toISOString();
    if (input.status === "active") {
        conditions.push(
            and(
                isNull(accountBans.revokedAt),
                or(isNull(accountBans.expiresAt), gt(accountBans.expiresAt, now)),
            )!,
        );
    } else if (input.status === "expired") {
        conditions.push(
            and(
                isNull(accountBans.revokedAt),
                sql`${accountBans.expiresAt} IS NOT NULL`,
                lte(accountBans.expiresAt, now),
            )!,
        );
    } else if (input.status === "revoked") {
        conditions.push(sql`${accountBans.revokedAt} IS NOT NULL`);
    }
    if (cursor) conditions.push(cursorCondition(accountBans.bannedAt, accountBans.id, cursor));
    const rows = await executor
        .select(banSelection)
        .from(accountBans)
        .leftJoin(users, eq(users.accountId, accountBans.accountId))
        .where(and(...conditions))
        .orderBy(desc(accountBans.bannedAt), desc(accountBans.id))
        .limit(input.limit + 1);
    return page(rows, input.limit, asBan, (item) => item.bannedAt);
}
