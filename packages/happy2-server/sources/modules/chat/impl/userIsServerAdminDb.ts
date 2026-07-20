import { type DrizzleExecutor } from "../../drizzle.js";

import { accounts, roles, serverSetupState, userRoles, users } from "../../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/** Returns whether an active human identity holds the durable server-administrator authority. */
export async function userIsServerAdminDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<boolean> {
    const [row] = await executor
        .select({ id: users.id })
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
    return row !== undefined;
}
