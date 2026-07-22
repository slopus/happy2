import { and, eq, isNull, or } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { accounts, roles, serverSetupState, userRoles, users } from "../schema.js";

/**
 * Lists active human users whose bootstrap ownership or built-in role grants server-administrator visibility.
 * Project creation uses this exact durable authority projection to target private-directory hints without publishing their metadata server-wide.
 */
export async function userServerAdminList(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .innerJoin(serverSetupState, eq(serverSetupState.id, 1))
        .leftJoin(userRoles, eq(userRoles.userId, users.id))
        .leftJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
            and(
                eq(users.kind, "human"),
                or(
                    eq(serverSetupState.bootstrapAdminUserId, users.id),
                    eq(roles.builtinKind, "admin"),
                ),
                isNull(users.deletedAt),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
                eq(accounts.active, 1),
            ),
        );
    return rows.map((row) => row.id);
}
