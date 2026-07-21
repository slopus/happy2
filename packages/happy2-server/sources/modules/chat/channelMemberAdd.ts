import { type ChatRole, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { createChannelServiceMessageDb } from "./impl/createChannelServiceMessageDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireActiveIdentityDb } from "./impl/requireActiveIdentityDb.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";
import { areaHint } from "./areaHint.js";

/**
 * Adds or restores an active identity in chatMembers after checking the actor's management rights and the target's eligibility.
 * A fresh membership epoch, service event, and attachment-gated documents hint make the new access grant unambiguous to history and the affected user's clients.
 */
export async function channelMemberAdd(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        userId: string;
        role?: ChatRole;
    },
): Promise<{
    hint: MutationHint;
    documentsHint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.parentChatId)
            throw new CollaborationError("invalid", "Nested chat membership is inherited");
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct-message membership is fixed");
        if (
            input.role === "owner" &&
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.recoverableMembershipRole !== "owner"
        )
            throw new CollaborationError("forbidden", "Only an owner can assign ownership");
        const identityKind = await requireActiveIdentityDb(tx, input.userId);
        if (identityKind === "agent") {
            if (input.role && input.role !== "member")
                throw new CollaborationError("invalid", "Agents cannot have channel roles");
        }
        const [existing] = await tx
            .select({
                leftAt: chatMembers.leftAt,
            })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, input.chatId), eq(chatMembers.userId, input.userId)))
            .limit(1);
        if (existing && existing.leftAt === null)
            throw new CollaborationError("conflict", "User is already a channel member");
        const sequence = await syncSequenceNext(tx);
        await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "member.joined",
            input.userId,
            input.userId,
        );
        await tx
            .insert(chatMembers)
            .values({
                chatId: input.chatId,
                userId: input.userId,
                role: input.role ?? "member",
                membershipEpoch: createId(),
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: {
                    role: sql`excluded.role`,
                    membershipEpoch: sql`excluded.membership_epoch`,
                    syncSequence: sql`excluded.sync_sequence`,
                    joinedAt: sql`CURRENT_TIMESTAMP`,
                    leftAt: null,
                    removedByUserId: null,
                },
            });
        const documentsChanged = await chatDescendantMembershipSync(tx, {
            ancestorChatId: input.chatId,
            userId: input.userId,
            actorUserId: input.actorUserId,
            sequence,
            kind: "joined",
            role: input.role ?? "member",
        });
        const service = await createChannelServiceMessageDb(tx, {
            sequence,
            chatId: input.chatId,
            userId: input.userId,
            type: "user_added",
        });
        return {
            hint: chatHint(sequence, input.chatId, service.pts),
            ...(documentsChanged ? { documentsHint: areaHint(sequence, "documents") } : {}),
        };
    });
}
