import { type ChatSummary, CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { chatMembers, chats, userChatPreferences } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { chatUpdateInsert } from "../chat/chatUpdateInsert.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Creates the canonical ordinary chats row for a live parent message, inheriting its policy into chatMembers and following it in userChatPreferences for the creator and root author.
 * The unique parent relation, parent chatUpdates projection, syncEvents history, and memberships commit together so concurrent creation cannot expose duplicate or partially usable threads.
 */
export async function threadCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        parentMessageId: string;
    },
): Promise<{
    chat: ChatSummary;
    hints: MutationHint[];
    created: boolean;
}> {
    return withTransaction(executor, async (tx) => {
        const parentMessage = await messageGetProjection(
            tx,
            input.actorUserId,
            input.parentMessageId,
        );
        if (!parentMessage || parentMessage.deletedAt)
            throw new CollaborationError("not_found", "Parent message was not found");
        const parent = await chatGetAccess(tx, input.actorUserId, parentMessage.chatId, true);
        if (!parent) throw new CollaborationError("not_found", "Parent message was not found");
        if (parent.archivedAt)
            throw new CollaborationError("forbidden", "Archived chats do not accept threads");
        if (await chatIsPostingRestricted(tx, input.actorUserId, parent.id))
            throw new CollaborationError("forbidden", "Posting is restricted in this chat");

        const [existing] = await tx
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.parentMessageId, parentMessage.id), isNull(chats.deletedAt)))
            .limit(1);
        if (existing) {
            const chat = await chatGetAccess(tx, input.actorUserId, existing.id, false);
            if (!chat) throw new Error("Existing thread chat is inaccessible to its parent member");
            return { chat, hints: [], created: false };
        }

        const [parentStorage] = await tx
            .select({ visibility: chats.visibility })
            .from(chats)
            .where(eq(chats.id, parent.id))
            .limit(1);
        if (!parentStorage) throw new Error("Readable parent chat has no durable row");
        const members = await tx
            .select({ userId: chatMembers.userId, role: chatMembers.role })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, parent.id), isNull(chatMembers.leftAt)));
        const childId = createId();
        const inserted = await tx
            .insert(chats)
            .values({
                id: childId,
                kind: parent.kind,
                name: parent.kind === "dm" ? undefined : (parent.name ?? "Thread"),
                parentMessageId: parentMessage.id,
                createdByUserId: input.actorUserId,
                dmKey: parent.kind === "dm" ? `thread:${parentMessage.id}` : undefined,
                dmType: parent.kind === "dm" ? parent.dmType : undefined,
                pts: 1,
                ownerUserId: parent.ownerUserId,
                visibility: parentStorage.visibility,
                isListed: 0,
                retentionMode: parent.retentionMode,
                retentionSeconds: parent.retentionSeconds,
                defaultExpiryMode: parent.defaultExpiryMode,
                defaultSelfDestructSeconds: parent.defaultSelfDestructSeconds,
                defaultAfterReadScope: parent.defaultAfterReadScope,
                defaultAgentUserId: parent.defaultAgentUserId,
            })
            .onConflictDoNothing()
            .returning({ id: chats.id });
        if (inserted.length === 0) {
            const [concurrent] = await tx
                .select({ id: chats.id })
                .from(chats)
                .where(and(eq(chats.parentMessageId, parentMessage.id), isNull(chats.deletedAt)))
                .limit(1);
            if (!concurrent) throw new Error("Thread chat conflict has no canonical row");
            const chat = await chatGetAccess(tx, input.actorUserId, concurrent.id, false);
            if (!chat)
                throw new Error("Concurrent thread chat is inaccessible to its parent member");
            return { chat, hints: [], created: false };
        }
        const sequence = await syncSequenceNext(tx);
        await tx.update(chats).set({ lastChangeSequence: sequence }).where(eq(chats.id, childId));
        for (const member of members)
            await tx.insert(chatMembers).values({
                chatId: childId,
                userId: member.userId,
                role: member.role,
                membershipEpoch: createId(),
                syncSequence: sequence,
            });
        const followedUserIds = new Set(
            [input.actorUserId, parentMessage.sender?.id].filter(Boolean) as string[],
        );
        for (const userId of followedUserIds) {
            await tx
                .insert(userChatPreferences)
                .values({ userId, chatId: childId, followed: 1, syncSequence: sequence })
                .onConflictDoUpdate({
                    target: [userChatPreferences.userId, userChatPreferences.chatId],
                    set: {
                        followed: 1,
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
            await syncEventInsert(tx, {
                sequence,
                kind: "threadPreferences.changed",
                chatId: childId,
                entityId: childId,
                actorUserId: input.actorUserId,
                targetUserId: userId,
            });
        }
        const parentMutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            parent.id,
            "message.threadCreated",
            parentMessage.id,
        );
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: childId,
            kind: "chat.created",
            entityId: childId,
            actorUserId: input.actorUserId,
        });
        const chat = await chatGetAccess(tx, input.actorUserId, childId, false);
        if (!chat) throw new Error("Created thread chat is not readable");
        return {
            chat,
            hints: [
                chatHint(sequence, parent.id, parentMutation.pts),
                chatHint(sequence, childId, 1),
            ],
            created: true,
        };
    });
}
