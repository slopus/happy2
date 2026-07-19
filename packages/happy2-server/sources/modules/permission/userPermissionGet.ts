import { eq } from "drizzle-orm";
import { userRequireActiveHuman } from "../chat/userRequireActiveHuman.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { userPermissions, userRoles } from "../schema.js";
import { permissionGetEffective } from "./permissionGetEffective.js";
import { userRequirePermission } from "./userRequirePermission.js";
import { permissions, type Permission } from "./types.js";

/**
 * Returns one active user's direct grants, assigned role identifiers, and effective permission projection to an authorized role administrator.
 * Keeping direct and inherited state distinct lets management clients edit explicit grants without accidentally flattening role membership.
 */
export async function userPermissionGet(
    executor: DrizzleExecutor,
    input: { actorUserId: string; userId: string },
): Promise<{
    direct: Permission[];
    roleIds: string[];
    effective: Awaited<ReturnType<typeof permissionGetEffective>>;
}> {
    await userRequirePermission(executor, input.actorUserId, "manageAdminRoles");
    await userRequireActiveHuman(executor, input.userId);
    const [directRows, roleRows, effective] = await Promise.all([
        executor
            .select({ permission: userPermissions.permission })
            .from(userPermissions)
            .where(eq(userPermissions.userId, input.userId)),
        executor
            .select({ roleId: userRoles.roleId })
            .from(userRoles)
            .where(eq(userRoles.userId, input.userId))
            .orderBy(userRoles.createdAt, userRoles.roleId),
        permissionGetEffective(executor, input.userId),
    ]);
    const directSet = new Set<Permission>(
        directRows.map(({ permission }) => permission as Permission),
    );
    return {
        direct: permissions.filter((permission) => directSet.has(permission)),
        roleIds: roleRows.map(({ roleId }) => roleId),
        effective,
    };
}
