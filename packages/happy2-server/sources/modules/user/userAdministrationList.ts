import { type AdminUserSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, authSessions, users } from "../schema.js";
import { asUser } from "../chat/asUser.js";

import { eq, sql } from "drizzle-orm";
import { optionalText } from "../chat/optionalText.js";

import { text } from "../chat/text.js";
import { userSelection } from "../chat/userSelection.js";

import { userRequirePermission } from "../permission/userRequirePermission.js";
/**
 * Lists all human and agent records with account status and latest session activity for a server administrator.
 * The server-admin check is part of this projection because it intentionally includes banned and deleted accounts hidden from ordinary directories.
 */
export async function userAdministrationList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<
    Array<
        AdminUserSummary & {
            email: string;
            bannedAt?: string;
            deletedAt?: string;
            sessionLastSeenAt?: string;
        }
    >
> {
    await userRequirePermission(executor, actorUserId, "viewAllMembers");
    const result = await executor
        .select({
            ...userSelection,
            last_access_at: users.lastAccessAt,
            email: accounts.email,
            banned_at: accounts.bannedAt,
            deleted_at: accounts.deletedAt,
            session_last_seen_at: sql<string | null>`max(${authSessions.lastSeenAt})`,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .leftJoin(authSessions, eq(authSessions.accountId, accounts.id))
        .groupBy(users.id)
        .orderBy(users.createdAt, users.id);
    return result.map((row) => ({
        ...asUser(row),
        lastAccessAt: optionalText(row.last_access_at),
        email: text(row.email),
        bannedAt: optionalText(row.banned_at),
        deletedAt: optionalText(row.deleted_at),
        sessionLastSeenAt: optionalText(row.session_last_seen_at),
    }));
}
