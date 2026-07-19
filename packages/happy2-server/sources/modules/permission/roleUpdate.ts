import { eq, sql } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { CollaborationError } from "../chat/types.js";
import { isUniqueConstraint } from "../chat/isUniqueConstraint.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { rolePermissions, roles, userRoles } from "../schema.js";
import { permissionMutationRecord } from "./impl/permissionMutationRecord.js";
import type { Permission, PermissionMutation } from "./types.js";
import { userRequirePermission } from "./userRequirePermission.js";

/**
 * Updates a roles row's editable metadata and optional complete rolePermissions allow-list while preserving its immutable built-in marker.
 * Permission changes notify every assigned user in the same transaction so their clients can immediately refetch `/v0/me`.
 */
export async function roleUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        roleId: string;
        name?: string;
        description?: string | null;
        permissions?: Permission[];
    },
): Promise<PermissionMutation> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
        if (!role) throw new CollaborationError("not_found", "Role was not found");
        if (input.name !== undefined) {
            const [duplicate] = await tx
                .select({ id: roles.id })
                .from(roles)
                .where(
                    sql`${roles.id} <> ${input.roleId} AND lower(${roles.name}) = lower(${input.name})`,
                )
                .limit(1);
            if (duplicate) throw new CollaborationError("conflict", "A role with this name exists");
        }
        try {
            await tx
                .update(roles)
                .set({
                    ...(input.name === undefined ? {} : { name: input.name }),
                    ...(input.description === undefined ? {} : { description: input.description }),
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(roles.id, input.roleId));
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "A role with this name exists");
            throw error;
        }
        if (input.permissions !== undefined) {
            await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
            if (input.permissions.length)
                await tx.insert(rolePermissions).values(
                    input.permissions.map((permission) => ({
                        roleId: input.roleId,
                        permission,
                    })),
                );
        }
        const affectedUserIds =
            input.permissions === undefined
                ? []
                : (
                      await tx
                          .select({ userId: userRoles.userId })
                          .from(userRoles)
                          .where(eq(userRoles.roleId, input.roleId))
                  ).map(({ userId }) => userId);
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "role.updated",
            targetType: "role",
            targetId: input.roleId,
            before: { name: role.name, description: role.description },
            after: {
                name: input.name,
                description: input.description,
                permissions: input.permissions,
            },
        });
        return permissionMutationRecord(tx, {
            actorUserId: input.actorUserId,
            affectedUserIds,
            broadcast: true,
            entityId: input.roleId,
            kind: input.permissions === undefined ? "role.updated" : "permissions.changed",
        });
    });
}
