import { type ChatRole, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { createChannelServiceMessageDb } from "./impl/createChannelServiceMessageDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireActiveIdentityDb } from "./impl/requireActiveIdentityDb.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";
import { areaHint } from "./areaHint.js";
import { childMemberRequireParent } from "./impl/childMemberRequireParent.js";

/**
 * Adds or restores an eligible identity in chatMembers and updates chats to atomically transfer private ownership when requested.
 * A fresh membership epoch, service event, and attachment-gated documents hint make the independent access grant unambiguous to clients.
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
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct-message membership is fixed");
        if (access.kind === "public_channel" && input.role === "owner")
            throw new CollaborationError("invalid", "Public channels do not have owners");
        if (
            input.role === "owner" &&
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.recoverableMembershipRole !== "owner"
        )
            throw new CollaborationError("forbidden", "Only an owner can assign ownership");
        const identityKind = await requireActiveIdentityDb(tx, input.userId);
        await childMemberRequireParent(tx, access.parentChatId, input.userId);
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
        if (input.role === "owner") {
            await tx
                .update(chatMembers)
                .set({
                    role: "admin",
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(chatMembers.chatId, input.chatId), eq(chatMembers.role, "owner")));
            await tx
                .update(chats)
                .set({ ownerUserId: input.userId, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(chats.id, input.chatId));
        }
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
