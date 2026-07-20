import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chatMembers } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { createUserAddedServiceMessageDb } from "./impl/createUserAddedServiceMessageDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";

/**
 * Inserts or reactivates the actor's chatMembers row for a public, joinable channel and assigns a fresh membership epoch.
 * Recording the membership with its channel update prevents message access from opening before other clients learn that the user joined.
 */
export async function channelJoinPublic(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, actorUserId, chatId, false);
        if (!access || access.kind !== "public_channel")
            throw new CollaborationError("not_found", "Public channel was not found");
        if (access.parentMessageId || access.parentChatId)
            throw new CollaborationError(
                "invalid",
                "Join the parent channel to access its nested chats",
            );
        if (access.membershipRole)
            throw new CollaborationError("conflict", "Already joined this channel");
        const sequence = await syncSequenceNext(tx);
        await chatAdvanceWithSequence(
            tx,
            sequence,
            actorUserId,
            chatId,
            "member.joined",
            actorUserId,
            actorUserId,
        );
        await tx
            .insert(chatMembers)
            .values({
                chatId,
                userId: actorUserId,
                role: "member",
                membershipEpoch: createId(),
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: {
                    role: "member",
                    membershipEpoch: sql`excluded.membership_epoch`,
                    syncSequence: sql`excluded.sync_sequence`,
                    joinedAt: sql`CURRENT_TIMESTAMP`,
                    leftAt: null,
                },
            });
        await chatDescendantMembershipSync(tx, {
            ancestorChatId: chatId,
            userId: actorUserId,
            actorUserId,
            sequence,
            kind: "joined",
            role: "member",
        });
        const service = await createUserAddedServiceMessageDb(tx, {
            sequence,
            chatId,
            userId: actorUserId,
        });
        const chat = await chatGetAccess(tx, actorUserId, chatId, false);
        if (!chat) throw new Error("Joined chat is not readable");
        return {
            chat,
            hint: chatHint(sequence, chatId, service.pts),
        };
    });
}
