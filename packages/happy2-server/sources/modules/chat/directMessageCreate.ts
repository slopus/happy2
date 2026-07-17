import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { chatGetAccess } from "./chatGetAccess.js";
import { chatUpdateInsert } from "./chatUpdateInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireActiveIdentityDb } from "./impl/requireActiveIdentityDb.js";
import { userRequireActive } from "./userRequireActive.js";

/**
 * Finds or creates the canonical one-to-one chats conversation and active chatMembers rows for two eligible identities.
 * Serializing participant-key lookup and creation guarantees repeated or concurrent requests resolve to one DM rather than parallel histories.
 */
export async function directMessageCreate(
    executor: DrizzleExecutor,
    actorUserId: string,
    otherUserId: string,
): Promise<{
    chat: ChatSummary;
    hint?: MutationHint;
}> {
    if (actorUserId === otherUserId)
        throw new CollaborationError("invalid", "A direct message requires another user");
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, actorUserId);
        await requireActiveIdentityDb(tx, otherUserId);
        const dmKey = [actorUserId, otherUserId].sort().join(":");
        const [existing] = await tx
            .select({
                id: chats.id,
            })
            .from(chats)
            .where(eq(chats.dmKey, dmKey))
            .limit(1);
        if (existing) {
            const chat = await chatGetAccess(tx, actorUserId, existing.id, false);
            if (!chat) throw new Error("Existing DM is inaccessible");
            return {
                chat,
            };
        }
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        await tx.insert(chats).values({
            id,
            kind: "dm",
            dmType: "direct",
            createdByUserId: actorUserId,
            ownerUserId: actorUserId,
            dmKey,
            pts: 1,
            isListed: 0,
            visibility: "direct",
            lastChangeSequence: sequence,
        });
        for (const userId of [actorUserId, otherUserId]) {
            await tx.insert(chatMembers).values({
                chatId: id,
                userId,
                role: userId === actorUserId ? "owner" : "member",
                membershipEpoch: createId(),
                syncSequence: sequence,
            });
        }
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: id,
            kind: "chat.created",
            entityId: id,
            actorUserId,
        });
        const chat = await chatGetAccess(tx, actorUserId, id, false);
        if (!chat) throw new Error("Created DM is not readable");
        return {
            chat,
            hint: chatHint(sequence, id, 1),
        };
    });
}
