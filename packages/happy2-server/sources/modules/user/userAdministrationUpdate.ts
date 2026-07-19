import { CollaborationError, type MutationHint, type UserSummary } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { asUser } from "../chat/asUser.js";

import { userSelection } from "../chat/userSelection.js";
import { roles, serverSetupState, userRoles, users } from "../schema.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActiveHuman } from "../chat/userRequireActiveHuman.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Changes administrator-managed users role, title, or account policy fields after validating both actor and target identities.
 * Committing the identity update with sync and audit evidence prevents privileges from changing silently or before other clients reconcile them.
 */
export async function userAdministrationUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        userId: string;
        title?: string | null;
        role?: "member" | "admin";
    },
): Promise<{
    user: UserSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "manageAdminRoles");
        await userRequireActiveHuman(tx, input.userId);
        if (input.actorUserId === input.userId && input.role === "member")
            throw new CollaborationError("invalid", "An admin cannot demote themselves");
        if (input.role === "member") {
            const [setup] = await tx
                .select({ ownerUserId: serverSetupState.bootstrapAdminUserId })
                .from(serverSetupState)
                .where(eq(serverSetupState.id, 1));
            if (setup?.ownerUserId === input.userId)
                throw new CollaborationError("invalid", "The owner must remain an administrator");
        }
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(users)
            .set({
                ...(input.title === undefined
                    ? {}
                    : {
                          title: input.title,
                      }),
                ...(input.role === undefined
                    ? {}
                    : {
                          role: input.role,
                      }),
                syncSequence: sequence,
            })
            .where(and(eq(users.id, input.userId), isNull(users.deletedAt)));
        if (input.role !== undefined) {
            const [builtinRole] = await tx
                .select({ id: roles.id })
                .from(roles)
                .where(eq(roles.builtinKind, "admin"));
            if (!builtinRole) throw new Error("Built-in administrator role is missing");
            if (input.role === "admin")
                await tx
                    .insert(userRoles)
                    .values({
                        userId: input.userId,
                        roleId: builtinRole.id,
                        assignedByUserId: input.actorUserId,
                    })
                    .onConflictDoNothing();
            else
                await tx
                    .delete(userRoles)
                    .where(
                        and(
                            eq(userRoles.userId, input.userId),
                            eq(userRoles.roleId, builtinRole.id),
                        ),
                    );
        }
        await syncEventInsert(tx, {
            sequence,
            kind: "user.updated",
            entityId: input.userId,
            actorUserId: input.actorUserId,
        });
        if (input.role !== undefined)
            await syncEventInsert(tx, {
                sequence,
                kind: "permissions.changed",
                entityId: input.userId,
                actorUserId: input.actorUserId,
                targetUserId: input.userId,
            });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "user.administration_updated",
            targetType: "user",
            targetId: input.userId,
            after: {
                title: input.title,
                role: input.role,
            },
        });
        const [user] = await tx.select(userSelection).from(users).where(eq(users.id, input.userId));
        if (!user) throw new Error("Updated user is missing");
        return {
            user: asUser(user),
            hint:
                input.role === undefined
                    ? areaHint(sequence, "users")
                    : {
                          sequence: String(sequence),
                          chats: [],
                          areas: ["users", "permissions"],
                      },
        };
    });
}
