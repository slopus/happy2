import { and, eq } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { CollaborationError } from "../chat/types.js";
import { userRequireActiveHuman } from "../chat/userRequireActiveHuman.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { roles, serverSetupState, userRoles, users } from "../schema.js";
import { permissionMutationRecord } from "./impl/permissionMutationRecord.js";
import type { PermissionMutation } from "./types.js";
import { userRequirePermission } from "./userRequirePermission.js";

/**
 * Deletes one userRoles assignment while preserving universal member membership and the owner's built-in administrator membership.
 * Removing the admin marker also updates the coarse user projection before emitting the targeted permission invalidation.
 */
export async function userRoleUnassign(
    executor: DrizzleExecutor,
    input: { actorUserId: string; userId: string; roleId: string },
): Promise<PermissionMutation> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        await userRequireActiveHuman(tx, input.userId);
        const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
        if (!role) throw new CollaborationError("not_found", "Role was not found");
        if (role.builtinKind === "member")
            throw new CollaborationError("invalid", "The built-in member role is required");
        if (role.builtinKind === "admin") {
            if (input.actorUserId === input.userId)
                throw new CollaborationError(
                    "invalid",
                    "An administrator cannot demote themselves",
                );
            const [setup] = await tx
                .select({ ownerUserId: serverSetupState.bootstrapAdminUserId })
                .from(serverSetupState)
                .where(eq(serverSetupState.id, 1));
            if (setup?.ownerUserId === input.userId)
                throw new CollaborationError("invalid", "The owner must remain an administrator");
        }
        await tx
            .delete(userRoles)
            .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, input.roleId)));
        if (role.builtinKind === "admin")
            await tx.update(users).set({ role: "member" }).where(eq(users.id, input.userId));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "user.role_unassigned",
            targetType: "user",
            targetId: input.userId,
            before: { roleId: input.roleId },
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
