import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleExecutor } from "../../drizzle.js";
import {
    accounts,
    rolePermissions,
    serverSetupState,
    userPermissions,
    userRoles,
    users,
} from "../../schema.js";
import { permissions, type EffectivePermissions, type Permission } from "../types.js";

export async function permissionEffectiveDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<EffectivePermissions | undefined> {
    const [active] = await executor
        .select({
            id: users.id,
            ownerUserId: serverSetupState.bootstrapAdminUserId,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .innerJoin(serverSetupState, eq(serverSetupState.id, 1))
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        )
        .limit(1);
    if (!active) return undefined;
    if (active.ownerUserId === userId)
        return {
            allowed: [...permissions],
            owner: true,
        };
    const [direct, throughRoles] = await Promise.all([
        executor
            .select({ permission: userPermissions.permission })
            .from(userPermissions)
            .where(eq(userPermissions.userId, userId)),
        executor
            .select({ permission: rolePermissions.permission })
            .from(userRoles)
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
            .where(eq(userRoles.userId, userId)),
    ]);
    const granted = new Set<Permission>(
        [...direct, ...throughRoles].map(({ permission }) => permission as Permission),
    );
    return {
        allowed: permissions.filter((permission) => granted.has(permission)),
        owner: false,
    };
}
