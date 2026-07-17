import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError } from "../../operations/types.js";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
    chatMembers,
    chats,
    fileAccessGrants,
    files,
    messageAttachments,
    messages,
} from "../../schema.js";

import { dataExportCanAccessChat } from "../../data-export/dataExportCanAccessChat.js";
import { dataExportRequireExistingUser } from "../../data-export/dataExportRequireExistingUser.js";
/**
 * Validates every supplied report target, requiring existing users, visible chats and messages, matching chat/message pairs, and accessible live files.
 * Performing all target checks inside report creation prevents moderation records from becoming an oracle for private messages, grants, or attachments.
 */
export async function requireReportTargetAccess(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        targetUserId?: string;
        chatId?: string;
        messageId?: string;
        fileId?: string;
    },
): Promise<void> {
    if (input.targetUserId) await dataExportRequireExistingUser(tx, input.targetUserId);
    if (input.chatId && !(await dataExportCanAccessChat(tx, input.actorUserId, input.chatId)))
        throw new OperationsError("not_found", "Chat was not found");
    if (input.messageId) {
        const [message] = await tx
            .select({
                chatId: messages.chatId,
            })
            .from(messages)
            .where(eq(messages.id, input.messageId))
            .limit(1);
        if (!message || !(await dataExportCanAccessChat(tx, input.actorUserId, message.chatId)))
            throw new OperationsError("not_found", "Message was not found");
        if (input.chatId && input.chatId !== message.chatId)
            throw new OperationsError("invalid", "messageId does not belong to chatId");
    }
    if (input.fileId) {
        const grants = tx
            .select({
                found: sql`1`,
            })
            .from(fileAccessGrants)
            .where(
                and(
                    eq(fileAccessGrants.fileId, files.id),
                    or(
                        and(
                            eq(fileAccessGrants.principalType, "user"),
                            eq(fileAccessGrants.principalId, input.actorUserId),
                        ),
                        eq(fileAccessGrants.principalType, "server"),
                        and(
                            eq(fileAccessGrants.principalType, "chat"),
                            sql`exists (select 1 from chats c left join chat_members cm on cm.chat_id = c.id and cm.user_id = ${input.actorUserId} and cm.left_at is null where c.id = ${fileAccessGrants.principalId} and c.deleted_at is null and (c.visibility = 'public' or cm.user_id is not null))`,
                        ),
                    ),
                    or(
                        isNull(fileAccessGrants.expiresAt),
                        gt(fileAccessGrants.expiresAt, sql`CURRENT_TIMESTAMP`),
                    ),
                ),
            );
        const attachments = tx
            .select({
                found: sql`1`,
            })
            .from(messageAttachments)
            .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
            .innerJoin(chats, eq(chats.id, messages.chatId))
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, input.actorUserId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .where(
                and(
                    eq(messageAttachments.fileId, files.id),
                    isNull(messages.deletedAt),
                    isNull(chats.deletedAt),
                    or(eq(chats.visibility, "public"), sql`${chatMembers.userId} IS NOT NULL`),
                ),
            );
        const [accessible] = await tx
            .select({
                id: files.id,
            })
            .from(files)
            .where(
                and(
                    eq(files.id, input.fileId),
                    isNull(files.deletedAt),
                    or(
                        eq(files.isPublic, 1),
                        eq(files.uploadedByUserId, input.actorUserId),
                        sql`exists ${grants}`,
                        sql`exists ${attachments}`,
                    ),
                ),
            )
            .limit(1);
        if (!accessible) throw new OperationsError("not_found", "File was not found");
    }
}
