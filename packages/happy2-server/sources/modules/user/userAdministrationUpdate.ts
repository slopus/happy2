import { CollaborationError, type MutationHint, type UserSummary } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { asUser } from "../chat/asUser.js";

import { userSelection } from "../chat/userSelection.js";
import { users } from "../schema.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

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
        await userRequireServerAdmin(tx, input.actorUserId);
        await userRequireActive(tx, input.userId);
        if (input.actorUserId === input.userId && input.role === "member")
            throw new CollaborationError("invalid", "An admin cannot demote themselves");
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
        await syncEventInsert(tx, {
            sequence,
            kind: "user.updated",
            entityId: input.userId,
            actorUserId: input.actorUserId,
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
            hint: areaHint(sequence, "users"),
        };
    });
}
