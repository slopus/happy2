import { eq } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { CollaborationError } from "../chat/types.js";
import { userRequireActiveHuman } from "../chat/userRequireActiveHuman.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { roles, userRoles, users } from "../schema.js";
import { permissionMutationRecord } from "./impl/permissionMutationRecord.js";
import type { PermissionMutation } from "./types.js";
import { userRequirePermission } from "./userRequirePermission.js";

/**
 * Inserts one userRoles assignment for an active human user, synchronizing users when the durable admin marker is assigned.
 * The grant, audit record, and targeted permission invalidation commit atomically so authorization never changes silently.
 */
export async function userRoleAssign(
    executor: DrizzleExecutor,
    input: { actorUserId: string; userId: string; roleId: string },
): Promise<PermissionMutation> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        await userRequireActiveHuman(tx, input.userId);
        const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
        if (!role) throw new CollaborationError("not_found", "Role was not found");
        await tx
            .insert(userRoles)
            .values({
                userId: input.userId,
                roleId: input.roleId,
                assignedByUserId: input.actorUserId,
            })
            .onConflictDoNothing();
        if (role.builtinKind === "admin")
            await tx.update(users).set({ role: "admin" }).where(eq(users.id, input.userId));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "user.role_assigned",
            targetType: "user",
            targetId: input.userId,
            after: { roleId: input.roleId },
        });
        return permissionMutationRecord(tx, {
            actorUserId: input.actorUserId,
            affectedUserIds: [input.userId],
            broadcast: false,
            entityId: input.userId,
            kind: "permissions.changed",
        });
    });
}
