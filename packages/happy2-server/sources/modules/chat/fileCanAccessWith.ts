import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { files } from "../schema.js";

/**
 * Reports access to a complete, non-infected file through public state, ownership, a visible product reference, or an unexpired principal grant.
 * Keeping every indirect profile, chat, attachment, emoji, bot, and server reference in one predicate prevents inconsistent download authorization.
 */
export async function fileCanAccessWith(
    executor: DrizzleExecutor,
    userId: string,
    fileId: string,
): Promise<boolean> {
    const [row] = await executor
        .select({
            id: files.id,
        })
        .from(files)
        .where(
            and(
                eq(files.id, fileId),
                isNull(files.deletedAt),
                eq(files.uploadStatus, "complete"),
                ne(files.scanStatus, "infected"),
                or(
                    eq(files.isPublic, 1),
                    eq(files.uploadedByUserId, userId),
                    sql`exists (select 1 from custom_emojis e where e.file_id = ${files.id} and e.deleted_at is null)`,
                    sql`exists (select 1 from server_settings s where s.photo_file_id = ${files.id})`,
                    sql`exists (select 1 from users u where u.photo_file_id = ${files.id} and u.deleted_at is null)`,
                    sql`exists (select 1 from bot_identities b where b.photo_file_id = ${files.id} and b.deleted_at is null and b.active = 1)`,
                    sql`exists (select 1 from chats photo_chat left join chat_members photo_member on photo_member.chat_id = photo_chat.id and photo_member.user_id = ${userId} and photo_member.left_at is null where photo_chat.photo_file_id = ${files.id} and photo_chat.deleted_at is null and (photo_chat.kind = 'public_channel' or photo_member.user_id is not null))`,
                    sql`exists (select 1 from file_access_grants g where g.file_id = ${files.id} and (g.expires_at is null or datetime(g.expires_at) > CURRENT_TIMESTAMP) and ((g.principal_type = 'user' and g.principal_id = ${userId}) or g.principal_type in ('server', 'custom_emoji') or (g.principal_type = 'chat' and exists (select 1 from chats grant_chat left join chat_members grant_member on grant_member.chat_id = grant_chat.id and grant_member.user_id = ${userId} and grant_member.left_at is null where grant_chat.id = g.principal_id and grant_chat.deleted_at is null and (grant_chat.kind = 'public_channel' or grant_member.user_id is not null)))))`,
                    sql`exists (select 1 from message_attachments ma join messages m on m.id = ma.message_id join chats c on c.id = m.chat_id left join chat_members cm on cm.chat_id = c.id and cm.user_id = ${userId} and cm.left_at is null where ma.file_id = ${files.id} and m.deleted_at is null and (m.expires_at is null or datetime(m.expires_at) > CURRENT_TIMESTAMP) and c.deleted_at is null and (c.kind = 'public_channel' or cm.user_id is not null))`,
                ),
            ),
        )
        .limit(1);
    return Boolean(row);
}
