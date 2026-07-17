import { type DrizzleExecutor } from "../drizzle.js";
import { type FileSummary } from "../chat/types.js";
import { and, eq, isNull, ne } from "drizzle-orm";
import { asFile } from "../chat/asFile.js";
import { customEmojis, files } from "../schema.js";

import { fileSelection } from "../chat/fileSelection.js";

import { text } from "../chat/text.js";
/**
 * Lists custom emoji definitions by name only when both the definition and its complete, non-infected file remain available.
 * Filtering unusable assets at the projection boundary prevents clients from rendering reactions whose underlying image cannot be served.
 */
export async function customEmojiList(executor: DrizzleExecutor): Promise<
    Array<{
        id: string;
        name: string;
        file: FileSummary;
        createdByUserId: string;
    }>
> {
    const result = await executor
        .select({
            emoji_id: customEmojis.id,
            name: customEmojis.name,
            created_by_user_id: customEmojis.createdByUserId,
            ...fileSelection,
        })
        .from(customEmojis)
        .innerJoin(files, eq(files.id, customEmojis.fileId))
        .where(
            and(
                isNull(customEmojis.deletedAt),
                isNull(files.deletedAt),
                eq(files.uploadStatus, "complete"),
                ne(files.scanStatus, "infected"),
            ),
        )
        .orderBy(customEmojis.name);
    return result.map((row) => ({
        id: text(row.emoji_id),
        name: text(row.name),
        file: asFile(row),
        createdByUserId: text(row.created_by_user_id),
    }));
}
