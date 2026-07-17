import { type ChatSummary, type NotificationLevel } from "../chat/types.js";
import { type DrizzleTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import {
    chatMembers,
    messageReceipts,
    messages,
    notifications,
    threadUserStates,
    userChatPreferences,
    userNotificationPreferences,
    users,
} from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { messageIsPast } from "./messageIsPast.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
/**
 * Updates recipient threadUserStates, chatMembers unread counters, messageReceipts, and notifications for a newly published message.
 * Sharing the publish transaction prevents recipients from receiving a badge or receipt for content that failed to become durable.
 */
export async function messageRecordDelivery(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        chat: ChatSummary;
        messageId: string;
        messageSequence: number;
        threadRootMessageId?: string;
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
            notifyThreadReplies: sql<number>`coalesce(${userChatPreferences.notifyThreadReplies}, 1)`,
            directMessages: sql<string>`coalesce(${userNotificationPreferences.directMessages}, 'all')`,
            mentionNotifications: sql<string>`coalesce(${userNotificationPreferences.mentions}, 'all')`,
            threadReplies: sql<string>`coalesce(${userNotificationPreferences.threadReplies}, 'all')`,
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
    let rootSenderUserId: string | undefined;
    if (input.threadRootMessageId) {
        const [root] = await tx
            .select({
                senderUserId: messages.senderUserId,
            })
            .from(messages)
            .where(eq(messages.id, input.threadRootMessageId));
        rootSenderUserId = root?.senderUserId ?? undefined;
        for (const userId of new Set(
            [input.actorUserId, rootSenderUserId].filter(Boolean) as string[],
        )) {
            const actor = userId === input.actorUserId;
            await tx
                .insert(threadUserStates)
                .values({
                    threadRootMessageId: input.threadRootMessageId,
                    userId,
                    subscribed: 1,
                    lastReadMessageId: input.messageId,
                    lastReadSequence: input.messageSequence,
                    lastParticipatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .onConflictDoUpdate({
                    target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                    set: {
                        subscribed: 1,
                        ...(actor
                            ? {
                                  lastReadMessageId: input.messageId,
                                  lastReadSequence: input.messageSequence,
                                  lastParticipatedAt: sql`CURRENT_TIMESTAMP`,
                              }
                            : {}),
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        }
    }
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
        let threadSubscribed = false;
        let threadNotificationLevel: NotificationLevel = "all";
        if (input.threadRootMessageId) {
            const [state] = await tx
                .select({
                    subscribed: threadUserStates.subscribed,
                    notificationLevel: threadUserStates.notificationLevel,
                })
                .from(threadUserStates)
                .where(
                    and(
                        eq(threadUserStates.threadRootMessageId, input.threadRootMessageId),
                        eq(threadUserStates.userId, userId),
                    ),
                )
                .limit(1);
            threadSubscribed = state?.subscribed === 1 || userId === rootSenderUserId;
            threadNotificationLevel = (state?.notificationLevel ?? "all") as NotificationLevel;
            if (threadSubscribed || isMentioned)
                await tx
                    .insert(threadUserStates)
                    .values({
                        threadRootMessageId: input.threadRootMessageId,
                        userId,
                        subscribed: threadSubscribed || isMentioned ? 1 : 0,
                        unreadCount: 1,
                        mentionCount: isMentioned ? 1 : 0,
                    })
                    .onConflictDoUpdate({
                        target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                        set: {
                            unreadCount: sql`${threadUserStates.unreadCount} + 1`,
                            mentionCount: sql`${threadUserStates.mentionCount} + ${isMentioned ? 1 : 0}`,
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        },
                    });
        }
        const muted =
            recipient.mutedUntil !== null && !messageIsPast(recipient.mutedUntil ?? undefined);
        const kind = isMentioned
            ? "mention"
            : input.threadRootMessageId && threadSubscribed
              ? "thread_reply"
              : input.chat.kind === "dm"
                ? "direct_message"
                : undefined;
        const globallyAllowed =
            kind === "mention"
                ? recipient.mentionNotifications !== "none"
                : kind === "thread_reply"
                  ? recipient.notifyThreadReplies === 1 &&
                    recipient.threadReplies !== "none" &&
                    (recipient.threadReplies !== "mentions" || isMentioned) &&
                    threadNotificationLevel !== "none" &&
                    (threadNotificationLevel !== "mentions" || isMentioned)
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
            threadRootMessageId: input.threadRootMessageId,
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
