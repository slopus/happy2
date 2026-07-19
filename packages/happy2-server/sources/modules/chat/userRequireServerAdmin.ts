import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, roles, serverSetupState, userRoles, users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires the durable owner or a member of the built-in administrator role backed by an active account.
 * The immutable built-in marker, rather than the role's editable name or legacy user label, remains the generic administration boundary.
 */
export async function userRequireServerAdmin(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const [row] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .innerJoin(serverSetupState, eq(serverSetupState.id, 1))
        .leftJoin(userRoles, eq(userRoles.userId, users.id))
        .leftJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                or(
                    eq(serverSetupState.bootstrapAdminUserId, userId),
                    eq(roles.builtinKind, "admin"),
                ),
                isNull(users.deletedAt),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
                eq(accounts.active, 1),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
}
