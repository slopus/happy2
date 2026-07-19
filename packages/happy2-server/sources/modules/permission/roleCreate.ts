import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { isUniqueConstraint } from "../chat/isUniqueConstraint.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { rolePermissions, roles } from "../schema.js";
import { permissionMutationRecord } from "./impl/permissionMutationRecord.js";
import type { Permission, PermissionMutation, RoleSummary } from "./types.js";
import { userRequirePermission } from "./userRequirePermission.js";

/**
 * Creates a custom roles row and its complete rolePermissions allow-list in one transaction, recording audit and sync evidence for management clients.
 * The action owns role-name uniqueness and grant persistence so no partially configured role can become assignable.
 */
export async function roleCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        name: string;
        description?: string;
        permissions: Permission[];
    },
): Promise<{ role: RoleSummary; mutation: PermissionMutation }> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        const [existing] = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(sql`lower(${roles.name}) = lower(${input.name})`)
            .limit(1);
        if (existing) throw new CollaborationError("conflict", "A role with this name exists");
        const id = createId();
        try {
            await tx.insert(roles).values({
                id,
                name: input.name,
                description: input.description ?? null,
                createdByUserId: input.actorUserId,
            });
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "A role with this name exists");
            throw error;
        }
        if (input.permissions.length)
            await tx.insert(rolePermissions).values(
                input.permissions.map((permission) => ({
                    roleId: id,
                    permission,
                })),
            );
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "role.created",
            targetType: "role",
            targetId: id,
            after: { name: input.name, permissions: input.permissions },
        });
        const mutation = await permissionMutationRecord(tx, {
            actorUserId: input.actorUserId,
            affectedUserIds: [],
            broadcast: true,
            entityId: id,
            kind: "role.created",
        });
        return {
            role: {
                id,
                name: input.name,
                ...(input.description ? { description: input.description } : {}),
                builtin: null,
                permissions: input.permissions,
                userIds: [],
            },
            mutation,
        };
    });
}
