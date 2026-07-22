import { type AdminUserSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, authSessions, users } from "../schema.js";
import { asUser } from "../chat/asUser.js";

import { eq, sql } from "drizzle-orm";
import { optionalText } from "../chat/optionalText.js";

import { userSelection } from "../chat/userSelection.js";

import { userRequirePermission } from "../permission/userRequirePermission.js";
/**
 * Lists every human and agent users record with optional credential status and latest session activity for an administrator.
 * Accountless local humans and agents remain visible while credential-backed rows include their account telemetry.
 */
export async function userAdministrationList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<
    Array<
        AdminUserSummary & {
            email?: string;
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
        .leftJoin(accounts, eq(accounts.id, users.accountId))
        .leftJoin(authSessions, eq(authSessions.accountId, accounts.id))
        .groupBy(users.id)
        .orderBy(users.createdAt, users.id);
    return result.map((row) => ({
        ...asUser(row),
        lastAccessAt: optionalText(row.last_access_at),
        email: optionalText(row.email),
        bannedAt: optionalText(row.banned_at),
        deletedAt: optionalText(row.deleted_at),
        sessionLastSeenAt: optionalText(row.session_last_seen_at),
    }));
}
