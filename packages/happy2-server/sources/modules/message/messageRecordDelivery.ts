import { type ChatSummary } from "../chat/types.js";
import { type DrizzleTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import {
    chatMembers,
    messageReceipts,
    notifications,
    userChatPreferences,
    userNotificationPreferences,
    users,
} from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { messageIsPast } from "./messageIsPast.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
/**
 * Updates recipient chatMembers unread counters, messageReceipts, and notifications for a newly published message.
 * Sharing the publish transaction prevents recipients from receiving a badge or receipt for content that failed to become durable.
 */
export async function messageRecordDelivery(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        chat: ChatSummary;
        messageId: string;
        messageSequence: number;
        mentionedUserIds: string[];
        mentionAll?: boolean;
        respectCurrentReadState?: boolean;
        syncSequence: number;
        senderUserId?: string;
    },
): Promise<void> {
    const mentioned = new Set(input.mentionedUserIds);
    const recipients = await tx
        .select({
            userId: chatMembers.userId,
            notificationLevel: sql<string>`coalesce(${userChatPreferences.notificationLevel}, 'all')`,
            mutedUntil: userChatPreferences.mutedUntil,
            directMessages: sql<string>`coalesce(${userNotificationPreferences.directMessages}, 'all')`,
            mentionNotifications: sql<string>`coalesce(${userNotificationPreferences.mentions}, 'all')`,
            lastReadSequence: chatMembers.lastReadSequence,
        })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .leftJoin(
            userChatPreferences,
            and(
                eq(userChatPreferences.chatId, chatMembers.chatId),
                eq(userChatPreferences.userId, chatMembers.userId),
            ),
        )
        .leftJoin(
            userNotificationPreferences,
            eq(userNotificationPreferences.userId, chatMembers.userId),
        )
        .where(
            and(
                eq(chatMembers.chatId, input.chat.id),
                isNull(chatMembers.leftAt),
                eq(users.kind, "human"),
                ne(chatMembers.userId, input.senderUserId ?? input.actorUserId),
            ),
        );
    for (const recipient of recipients) {
        const userId = recipient.userId;
        const isMentioned = input.mentionAll === true || mentioned.has(userId);
        const alreadyRead =
            input.respectCurrentReadState === true &&
            recipient.lastReadSequence >= input.messageSequence;
        await tx
            .update(chatMembers)
            .set({
                unreadCount: sql`${chatMembers.unreadCount} + ${alreadyRead ? 0 : 1}`,
                mentionCount: sql`${chatMembers.mentionCount} + ${isMentioned && !alreadyRead ? 1 : 0}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, input.chat.id),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt),
                ),
            );
        await tx
            .insert(messageReceipts)
            .values({
                messageId: input.messageId,
                userId,
                deliveredAt: sql`CURRENT_TIMESTAMP`,
                ...(alreadyRead
                    ? {
                          readAt: sql`CURRENT_TIMESTAMP`,
                      }
                    : {}),
            })
            .onConflictDoUpdate({
                target: [messageReceipts.messageId, messageReceipts.userId],
                set: {
                    deliveredAt: sql`coalesce(${messageReceipts.deliveredAt}, CURRENT_TIMESTAMP)`,
                    ...(alreadyRead
                        ? {
                              readAt: sql`coalesce(${messageReceipts.readAt}, CURRENT_TIMESTAMP)`,
                          }
                        : {}),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        const muted =
            recipient.mutedUntil !== null && !messageIsPast(recipient.mutedUntil ?? undefined);
        const kind = isMentioned
            ? "mention"
            : input.chat.kind === "dm"
              ? "direct_message"
              : undefined;
        const globallyAllowed =
            kind === "mention"
                ? recipient.mentionNotifications !== "none"
                : kind === "direct_message"
                  ? recipient.directMessages !== "none"
                  : true;
        if (
            alreadyRead ||
            !kind ||
            !globallyAllowed ||
            muted ||
            recipient.notificationLevel === "none" ||
            (recipient.notificationLevel === "mentions" && !isMentioned)
        )
            continue;
        const notificationId = createId();
        await tx.insert(notifications).values({
            id: notificationId,
            userId,
            kind,
            chatId: input.chat.id,
            messageId: input.messageId,
            actorUserId: input.actorUserId,
            syncSequence: input.syncSequence,
        });
        await syncEventInsert(tx, {
            sequence: input.syncSequence,
            kind: "notification.created",
            entityId: notificationId,
            actorUserId: input.actorUserId,
            targetUserId: userId,
        });
    }
}
