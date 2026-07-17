import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { areaHint } from "./areaHint.js";
import { chatHint } from "./chatHint.js";
import { chatMembers, messageReceipts, messages } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Upserts messageReceipts through the requested sequence, recomputes unread message counters, and advances the reader's chatMembers state.
 * One transaction prevents a receipt from becoming visible while the member badge or per-message delivery projection still reports the old unread range.
 */
export async function chatMarkRead(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        messageId?: string;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        const targetConditions = and(
            eq(messages.chatId, input.chatId),
            isNull(messages.deletedAt),
            or(
                isNull(messages.expiresAt),
                sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
            ),
            ...(input.messageId ? [eq(messages.id, input.messageId)] : []),
        );
        const [target] = await tx
            .select({
                id: messages.id,
                sequence: messages.sequence,
                changePts: messages.changePts,
            })
            .from(messages)
            .where(targetConditions)
            .orderBy(desc(messages.sequence))
            .limit(1);
        const targetSequence = target?.sequence ?? 0;
        const targetPts = target?.changePts ?? 0;
        const sequence = await syncSequenceNext(tx);
        const receiptMutation = target
            ? await chatAdvanceWithSequence(
                  tx,
                  sequence,
                  input.actorUserId,
                  input.chatId,
                  "receipt.read",
                  target.id,
              )
            : undefined;
        const receiptMessages = await tx
            .select({
                messageId: messages.id,
            })
            .from(messages)
            .where(
                and(
                    eq(messages.chatId, input.chatId),
                    lte(messages.sequence, targetSequence),
                    isNull(messages.deletedAt),
                    or(isNull(messages.senderUserId), ne(messages.senderUserId, input.actorUserId)),
                ),
            );
        if (receiptMessages.length)
            await tx
                .insert(messageReceipts)
                .values(
                    receiptMessages.map(({ messageId }) => ({
                        messageId,
                        userId: input.actorUserId,
                        deliveredAt: sql`CURRENT_TIMESTAMP`,
                        readAt: sql`CURRENT_TIMESTAMP`,
                    })),
                )
                .onConflictDoUpdate({
                    target: [messageReceipts.messageId, messageReceipts.userId],
                    set: {
                        deliveredAt: sql`coalesce(${messageReceipts.deliveredAt}, CURRENT_TIMESTAMP)`,
                        readAt: sql`coalesce(${messageReceipts.readAt}, CURRENT_TIMESTAMP)`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        await tx
            .update(messages)
            .set({
                firstReadAt: sql`coalesce(${messages.firstReadAt}, CURRENT_TIMESTAMP)`,
                expiresAt: sql`case when ${messages.expiresAt} is null or datetime(${messages.expiresAt}) > datetime('now', '+' || ${messages.selfDestructSeconds} || ' seconds') then strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ${messages.selfDestructSeconds} || ' seconds') else ${messages.expiresAt} end`,
            })
            .where(
                and(
                    eq(messages.chatId, input.chatId),
                    lte(messages.sequence, targetSequence),
                    isNull(messages.deletedAt),
                    or(isNull(messages.senderUserId), ne(messages.senderUserId, input.actorUserId)),
                    eq(messages.expiryMode, "after_read"),
                    sql`${messages.selfDestructSeconds} IS NOT NULL`,
                    or(
                        eq(messages.afterReadScope, "any_reader"),
                        sql`not exists (select 1 from chat_members cm inner join users reader on reader.id = cm.user_id where cm.chat_id = ${messages.chatId} and cm.left_at is null and reader.system_role is null and (${messages.senderUserId} is null or cm.user_id != ${messages.senderUserId}) and not exists (select 1 from message_receipts mr where mr.message_id = ${messages.id} and mr.user_id = cm.user_id and mr.read_at is not null))`,
                    ),
                ),
            );
        const expiringIds = tx
            .select({
                id: messages.id,
            })
            .from(messages)
            .where(
                and(
                    eq(messages.chatId, input.chatId),
                    lte(messages.sequence, targetSequence),
                    eq(messages.expiryMode, "after_read"),
                    sql`${messages.expiresAt} IS NOT NULL`,
                ),
            );
        await tx
            .update(messageReceipts)
            .set({
                expiryTriggeredAt: sql`coalesce(${messageReceipts.expiryTriggeredAt}, CURRENT_TIMESTAMP)`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(messageReceipts.userId, input.actorUserId),
                    sql`${messageReceipts.readAt} IS NOT NULL`,
                    inArray(messageReceipts.messageId, expiringIds),
                ),
            );
        await tx
            .update(chatMembers)
            .set({
                lastReadMessageId: target?.id ?? null,
                lastReadSequence: sql`max(${chatMembers.lastReadSequence}, ${targetSequence})`,
                lastReadPts: sql`max(${chatMembers.lastReadPts}, ${targetPts})`,
                lastReadAt: sql`CURRENT_TIMESTAMP`,
                unreadCount: sql`(select count(*) from messages m where m.chat_id = ${input.chatId} and m.sequence > ${targetSequence} and m.deleted_at is null and (m.sender_user_id is null or m.sender_user_id != ${input.actorUserId}) and (m.expires_at is null or datetime(m.expires_at) > CURRENT_TIMESTAMP))`,
                mentionCount: sql`(select count(*) from message_mentions mm join messages m on m.id = mm.message_id where m.chat_id = ${input.chatId} and m.sequence > ${targetSequence} and mm.mentioned_user_id = ${input.actorUserId} and m.deleted_at is null)`,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, input.chatId),
                    eq(chatMembers.userId, input.actorUserId),
                    isNull(chatMembers.leftAt),
                ),
            );
        await syncEventInsert(tx, {
            sequence,
            kind: "preferences.chatRead",
            entityId: input.chatId,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        if (target && receiptMutation)
            await tx
                .update(messages)
                .set({
                    changePts: receiptMutation.pts,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(messages.id, target.id));
        const chat = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!chat) throw new Error("Read chat became inaccessible");
        return {
            chat,
            hint: receiptMutation
                ? {
                      ...chatHint(sequence, input.chatId, receiptMutation.pts),
                      areas: ["preferences"],
                  }
                : areaHint(sequence, "preferences"),
        };
    });
}
