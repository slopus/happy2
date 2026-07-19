import { eq } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { userRequireActiveHuman } from "../chat/userRequireActiveHuman.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { userPermissions } from "../schema.js";
import { permissionMutationRecord } from "./impl/permissionMutationRecord.js";
import type { Permission, PermissionMutation } from "./types.js";
import { userRequirePermission } from "./userRequirePermission.js";

/**
 * Replaces an active user's complete userPermissions allow-list without altering grants inherited from assigned roles.
 * The replacement and targeted invalidation share one transaction so `/v0/me` can be safely refetched as soon as clients receive the hint.
 */
export async function userPermissionUpdate(
    executor: DrizzleExecutor,
    input: { actorUserId: string; userId: string; permissions: Permission[] },
): Promise<PermissionMutation> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        await userRequireActiveHuman(tx, input.userId);
        const before = await tx
            .select({ permission: userPermissions.permission })
            .from(userPermissions)
            .where(eq(userPermissions.userId, input.userId));
        await tx.delete(userPermissions).where(eq(userPermissions.userId, input.userId));
        if (input.permissions.length)
            await tx.insert(userPermissions).values(
                input.permissions.map((permission) => ({
                    userId: input.userId,
                    permission,
                    grantedByUserId: input.actorUserId,
                })),
            );
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "user.permissions_updated",
            targetType: "user",
            targetId: input.userId,
            before: { permissions: before.map(({ permission }) => permission) },
            after: { permissions: input.permissions },
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
