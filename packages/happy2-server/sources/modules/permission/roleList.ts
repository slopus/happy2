import type { DrizzleExecutor } from "../drizzle.js";
import { rolePermissions, roles, userRoles } from "../schema.js";
import { userRequirePermission } from "./userRequirePermission.js";
import { permissions, type Permission, type RoleSummary } from "./types.js";

/**
 * Lists every custom and built-in role with its grants and assigned users for an actor allowed to administer role membership.
 * Returning built-in markers from durable rows lets clients preserve the undeletable admin/member identities after either role is renamed.
 */
export async function roleList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<RoleSummary[]> {
    await userRequirePermission(executor, actorUserId, "manageAdminRoles");
    const [roleRows, permissionRows, assignmentRows] = await Promise.all([
        executor.select().from(roles).orderBy(roles.createdAt, roles.id),
        executor
            .select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission })
            .from(rolePermissions),
        executor
            .select({ roleId: userRoles.roleId, userId: userRoles.userId })
            .from(userRoles)
            .orderBy(userRoles.createdAt, userRoles.userId),
    ]);
    return roleRows.map((role) => {
        const granted = new Set<Permission>(
            permissionRows
                .filter(({ roleId }) => roleId === role.id)
                .map(({ permission }) => permission as Permission),
        );
        return {
            id: role.id,
            name: role.name,
            ...(role.description ? { description: role.description } : {}),
            builtin: role.builtinKind as RoleSummary["builtin"],
            permissions: permissions.filter((permission) => granted.has(permission)),
            userIds: assignmentRows
                .filter(({ roleId }) => roleId === role.id)
                .map(({ userId }) => userId),
        };
    });
}
