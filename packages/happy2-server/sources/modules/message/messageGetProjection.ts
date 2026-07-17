import { type DrizzleExecutor } from "../drizzle.js";
import { type MessageSummary, type ReactionSummary } from "../chat/types.js";

import {
    agentTurns,
    botIdentities,
    files,
    messageAttachments,
    messageMentions,
    messageReceipts,
    messages,
    reactions,
    threads,
    users,
} from "../schema.js";
import { alias } from "drizzle-orm/sqlite-core";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { asFile } from "../chat/asFile.js";
import { asServiceMessage } from "../chat/asServiceMessage.js";
import { asUser } from "../chat/asUser.js";

import { fileSelection } from "../chat/fileSelection.js";

import { messageIsPast } from "./messageIsPast.js";

import { chatGetAccess } from "../chat/chatGetAccess.js";
/**
 * Builds a message only for a viewer with chat access, collapsing deleted or expired content while expanding visible sender, files, reactions, mentions, receipts, quotes, and thread state.
 * Rechecking forwarded-chat visibility and suppressing related content on tombstones prevents indirect projections from bypassing chat, expiry, or file rules.
 */
export async function messageGetProjection(
    executor: DrizzleExecutor,
    viewerUserId: string,
    messageId: string,
): Promise<MessageSummary | undefined> {
    const sender = alias(users, "sender");
    const bot = alias(botIdentities, "sender_bot");
    const quoted = alias(messages, "quoted");
    const forwarded = alias(messages, "forwarded");
    const [row] = await executor
        .select({
            id: messages.id,
            chat_id: messages.chatId,
            sequence: messages.sequence,
            change_pts: messages.changePts,
            sender_user_id: messages.senderUserId,
            kind: messages.kind,
            text: messages.text,
            content_json: messages.contentJson,
            quoted_message_id: messages.quotedMessageId,
            thread_root_message_id: messages.threadRootMessageId,
            forwarded_from_message_id: messages.forwardedFromMessageId,
            expires_at: messages.expiresAt,
            edited_at: messages.editedAt,
            expiry_mode: messages.expiryMode,
            self_destruct_seconds: messages.selfDestructSeconds,
            first_read_at: messages.firstReadAt,
            revision: messages.revision,
            deleted_at: messages.deletedAt,
            created_at: messages.createdAt,
            sender_id: sender.id,
            sender_username: sender.username,
            sender_first_name: sender.firstName,
            sender_last_name: sender.lastName,
            sender_title: sender.title,
            sender_photo_file_id: sender.photoFileId,
            sender_role: sender.role,
            sender_kind: sender.kind,
            sender_system_role: sender.systemRole,
            sender_bot_id: bot.id,
            sender_bot_name: bot.name,
            sender_bot_username: bot.username,
            sender_bot_photo_file_id: bot.photoFileId,
            generation_status: agentTurns.status,
            quoted_sender_user_id: quoted.senderUserId,
            quoted_text: quoted.text,
            quoted_deleted_at: quoted.deletedAt,
            quoted_expires_at: quoted.expiresAt,
            forwarded_from_chat_id: forwarded.chatId,
            thread_reply_count: sql<number>`coalesce(${threads.replyCount}, 0)`,
        })
        .from(messages)
        .leftJoin(sender, eq(sender.id, messages.senderUserId))
        .leftJoin(bot, eq(bot.id, messages.senderBotId))
        .leftJoin(agentTurns, eq(agentTurns.assistantMessageId, messages.id))
        .leftJoin(quoted, eq(quoted.id, messages.quotedMessageId))
        .leftJoin(forwarded, eq(forwarded.id, messages.forwardedFromMessageId))
        .leftJoin(threads, eq(threads.rootMessageId, messages.id))
        .where(eq(messages.id, messageId))
        .limit(1);
    if (!row || !(await chatGetAccess(executor, viewerUserId, row.chat_id, false)))
        return undefined;
    const deleted = row.deleted_at !== null || messageIsPast(row.expires_at ?? undefined);
    const attachmentRows = deleted
        ? []
        : await executor
              .select(fileSelection)
              .from(messageAttachments)
              .innerJoin(files, eq(files.id, messageAttachments.fileId))
              .where(
                  and(
                      eq(messageAttachments.messageId, messageId),
                      isNull(files.deletedAt),
                      eq(files.uploadStatus, "complete"),
                      ne(files.scanStatus, "infected"),
                  ),
              )
              .orderBy(messageAttachments.position, files.id);
    const reactionRows = deleted
        ? []
        : await executor
              .select({
                  reaction_key: reactions.reactionKey,
                  emoji: reactions.emoji,
                  custom_emoji_id: reactions.customEmojiId,
                  user_id: reactions.userId,
              })
              .from(reactions)
              .where(eq(reactions.messageId, messageId))
              .orderBy(reactions.reactionKey, reactions.createdAt, reactions.userId);
    const mentionRows = deleted
        ? []
        : await executor
              .select({
                  kind: messageMentions.kind,
                  mentioned_user_id: messageMentions.mentionedUserId,
                  start_offset: messageMentions.startOffset,
                  length: messageMentions.length,
                  raw_text: messageMentions.rawText,
              })
              .from(messageMentions)
              .where(eq(messageMentions.messageId, messageId))
              .orderBy(messageMentions.startOffset);
    const receiptRows = await executor
        .select({
            user_id: messageReceipts.userId,
            delivered_at: messageReceipts.deliveredAt,
            read_at: messageReceipts.readAt,
        })
        .from(messageReceipts)
        .where(eq(messageReceipts.messageId, messageId))
        .orderBy(messageReceipts.userId);
    const reactionMap = new Map<string, ReactionSummary>();
    for (const reaction of reactionRows) {
        const existing = reactionMap.get(reaction.reaction_key) ?? {
            key: reaction.reaction_key,
            emoji: reaction.emoji ?? undefined,
            customEmojiId: reaction.custom_emoji_id ?? undefined,
            count: 0,
            reacted: false,
            userIds: [],
        };
        existing.count += 1;
        existing.reacted ||= reaction.user_id === viewerUserId;
        existing.userIds.push(reaction.user_id);
        reactionMap.set(reaction.reaction_key, existing);
    }
    const senderSummary = row.sender_id
        ? asUser({
              id: row.sender_id,
              username: row.sender_username,
              first_name: row.sender_first_name,
              last_name: row.sender_last_name,
              title: row.sender_title,
              photo_file_id: row.sender_photo_file_id,
              role: row.sender_role,
              user_kind: row.sender_kind,
              system_role: row.sender_system_role,
          })
        : undefined;
    const forwardedFromChatId = row.forwarded_from_chat_id ?? undefined;
    const forwardedFrom =
        row.forwarded_from_message_id &&
        forwardedFromChatId &&
        (await chatGetAccess(executor, viewerUserId, forwardedFromChatId, false))
            ? {
                  messageId: row.forwarded_from_message_id,
                  chatId: forwardedFromChatId,
              }
            : undefined;
    const quotedDeleted =
        row.quoted_deleted_at !== null || messageIsPast(row.quoted_expires_at ?? undefined);
    return {
        id: row.id,
        chatId: row.chat_id,
        sequence: String(row.sequence),
        changePts: String(row.change_pts),
        sender: senderSummary,
        senderBot: row.sender_bot_id
            ? {
                  id: row.sender_bot_id,
                  name: row.sender_bot_name!,
                  username: row.sender_bot_username!,
                  photoFileId: row.sender_bot_photo_file_id ?? undefined,
              }
            : undefined,
        kind: row.kind as "user" | "automated",
        text: deleted ? "" : row.text,
        service: deleted ? undefined : asServiceMessage(row.content_json),
        generationStatus:
            row.generation_status === "running"
                ? "streaming"
                : row.generation_status === "complete" || row.generation_status === "failed"
                  ? row.generation_status
                  : undefined,
        quotedMessage: row.quoted_message_id
            ? {
                  id: row.quoted_message_id,
                  senderUserId: row.quoted_sender_user_id ?? undefined,
                  text: quotedDeleted || deleted ? "" : (row.quoted_text ?? ""),
                  deleted: quotedDeleted,
              }
            : undefined,
        threadRootMessageId: row.thread_root_message_id ?? undefined,
        threadReplyCount: row.thread_reply_count,
        revision: row.revision,
        mentions: mentionRows.map((mention) => ({
            kind: mention.kind as MessageSummary["mentions"][number]["kind"],
            userId: mention.mentioned_user_id ?? undefined,
            offset: mention.start_offset,
            length: mention.length,
            rawText: mention.raw_text,
        })),
        forwardedFrom,
        attachments: attachmentRows.map(asFile),
        reactions: [...reactionMap.values()],
        receipts: receiptRows.map((receipt) => ({
            userId: receipt.user_id,
            deliveredAt: receipt.delivered_at ?? undefined,
            readAt: receipt.read_at ?? undefined,
        })),
        expiresAt: row.expires_at ?? undefined,
        expiryMode: row.expiry_mode as MessageSummary["expiryMode"],
        selfDestructSeconds: row.self_destruct_seconds ?? undefined,
        firstReadAt: row.first_read_at ?? undefined,
        editedAt: row.edited_at ?? undefined,
        deletedAt: deleted ? (row.deleted_at ?? row.expires_at ?? undefined) : undefined,
        createdAt: row.created_at,
    };
}
