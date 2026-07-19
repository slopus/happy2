import { eq } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { roles, userRoles } from "../schema.js";
import { permissionMutationRecord } from "./impl/permissionMutationRecord.js";
import type { PermissionMutation } from "./types.js";
import { userRequirePermission } from "./userRequirePermission.js";

/**
 * Deletes one custom roles row and its cascading grants and assignments while refusing either durable built-in marker.
 * Capturing affected users before deletion allows the same commit to notify every client whose effective permissions changed.
 */
export async function roleDelete(
    executor: DrizzleExecutor,
    input: { actorUserId: string; roleId: string },
): Promise<PermissionMutation> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
        if (!role) throw new CollaborationError("not_found", "Role was not found");
        if (role.builtinKind)
            throw new CollaborationError("invalid", "Built-in roles cannot be deleted");
        const affectedUserIds = (
            await tx
                .select({ userId: userRoles.userId })
                .from(userRoles)
                .where(eq(userRoles.roleId, input.roleId))
        ).map(({ userId }) => userId);
        await tx.delete(roles).where(eq(roles.id, input.roleId));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "role.deleted",
            targetType: "role",
            targetId: input.roleId,
            before: { name: role.name },
        });
        return permissionMutationRecord(tx, {
            actorUserId: input.actorUserId,
            affectedUserIds,
            broadcast: true,
            entityId: input.roleId,
            kind: "permissions.changed",
        });
    });
}
