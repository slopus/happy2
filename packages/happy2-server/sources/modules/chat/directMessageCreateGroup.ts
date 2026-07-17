import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { createId } from "@paralleldrive/cuid2";

import { chatGetAccess } from "./chatGetAccess.js";
import { chatUpdateInsert } from "./chatUpdateInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireActiveIdentityDb } from "./impl/requireActiveIdentityDb.js";
import { userRequireActive } from "./userRequireActive.js";

/**
 * Creates a group-DM chats row with the exact validated chatMembers set supplied by its active creator.
 * Committing the participant set before sync publication ensures every invitee enters the same private conversation with no partially built roster.
 */
export async function directMessageCreateGroup(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        userIds: string[];
        name?: string;
    },
): Promise<{
    chat: ChatSummary;
    hint?: MutationHint;
    memberUserIds: string[];
}> {
    const memberUserIds = [...new Set([input.actorUserId, ...input.userIds])].sort();
    if (memberUserIds.length < 3 || memberUserIds.length > 50)
        throw new CollaborationError(
            "invalid",
            "A group direct message requires between 3 and 50 distinct members",
        );
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        for (const userId of memberUserIds) {
            await requireActiveIdentityDb(tx, userId);
        }
        const dmKey = `group:${memberUserIds.join(":")}`;
        const [existing] = await tx
            .select({
                id: chats.id,
            })
            .from(chats)
            .where(and(eq(chats.dmKey, dmKey), isNull(chats.deletedAt)))
            .limit(1);
        if (existing) {
            const chat = await chatGetAccess(tx, input.actorUserId, existing.id, false);
            if (!chat) throw new Error("Existing group DM is inaccessible");
            return {
                chat,
                memberUserIds,
            };
        }
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        await tx.insert(chats).values({
            id,
            kind: "dm",
            dmType: "group",
            name: input.name,
            createdByUserId: input.actorUserId,
            ownerUserId: input.actorUserId,
            dmKey,
            pts: 1,
            isListed: 0,
            visibility: "direct",
            lastChangeSequence: sequence,
        });
        for (const userId of memberUserIds)
            await tx.insert(chatMembers).values({
                chatId: id,
                userId,
                role: userId === input.actorUserId ? "owner" : "member",
                membershipEpoch: createId(),
                syncSequence: sequence,
                invitedByUserId: input.actorUserId,
            });
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: id,
            kind: "chat.groupDirectMessageCreated",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        const chat = await chatGetAccess(tx, input.actorUserId, id, false);
        if (!chat) throw new Error("Created group DM is not readable");
        return {
            chat,
            hint: chatHint(sequence, id, 1),
            memberUserIds,
        };
    });
}
