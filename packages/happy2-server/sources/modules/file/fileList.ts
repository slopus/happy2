import { type DrizzleExecutor } from "../drizzle.js";
import { type FileKind } from "./types.js";
import { type FileSummary } from "../chat/types.js";
import { and, desc, eq, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";

import { asFile } from "../chat/asFile.js";
import { chatMembers, chats, files, messageAttachments, messages } from "../schema.js";

import { fileSelection } from "../chat/fileSelection.js";

import { text } from "../chat/text.js";
/**
 * Pages complete, non-infected files attached to live messages in public or joined chats, optionally filtering kind and continuing before a file cursor.
 * Ordering by creation time and identifier makes the media browser stable while message expiry and chat membership remain part of every page query.
 */
export async function fileList(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        kind?: FileKind;
        before?: string;
        limit: number;
    },
): Promise<{
    files: FileSummary[];
    nextCursor?: string;
}> {
    const conditions: SQL[] = [
        isNull(files.deletedAt),
        eq(files.uploadStatus, "complete"),
        ne(files.scanStatus, "infected"),
        isNull(messages.deletedAt),
        or(isNull(messages.expiresAt), sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`)!,
        isNull(chats.deletedAt),
        or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`)!,
    ];
    if (input.kind) {
        conditions.push(eq(files.kind, input.kind));
    }
    if (input.before) {
        const [cursor] = await executor
            .select({
                createdAt: files.createdAt,
            })
            .from(files)
            .where(eq(files.id, input.before));
        if (cursor)
            conditions.push(
                or(
                    lt(files.createdAt, cursor.createdAt),
                    and(eq(files.createdAt, cursor.createdAt), lt(files.id, input.before)),
                )!,
            );
    }
    const result = await executor
        .selectDistinct(fileSelection)
        .from(files)
        .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
        .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, chats.id),
                eq(chatMembers.userId, input.userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .where(and(...conditions))
        .orderBy(desc(files.createdAt), desc(files.id))
        .limit(input.limit + 1);
    const hasMore = result.length > input.limit;
    const rows = result.slice(0, input.limit);
    return {
        files: rows.map(asFile),
        nextCursor: hasMore ? text(rows.at(-1)?.id) : undefined,
    };
}
