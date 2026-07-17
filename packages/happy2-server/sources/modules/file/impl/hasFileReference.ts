import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
    botIdentities,
    chatBookmarks,
    chats,
    customEmojis,
    dataExportJobs,
    fileAccessGrants,
    fileDerivatives,
    files,
    messageAttachments,
    messages,
    scheduledMessageAttachments,
    serverSettings,
    userBookmarks,
    users,
} from "../../schema.js";

import { type DrizzleExecutor } from "../../drizzle.js";

/** Returns whether any live product record still owns or derives from the file before deletion. */
export async function hasFileReference(
    executor: DrizzleExecutor,
    fileId: string,
): Promise<boolean> {
    const checks = [
        executor
            .select({
                id: messageAttachments.fileId,
            })
            .from(messageAttachments)
            .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
            .where(and(eq(messageAttachments.fileId, fileId), isNull(messages.deletedAt)))
            .limit(1),
        executor
            .select({
                id: scheduledMessageAttachments.fileId,
            })
            .from(scheduledMessageAttachments)
            .where(eq(scheduledMessageAttachments.fileId, fileId))
            .limit(1),
        executor
            .select({
                id: customEmojis.fileId,
            })
            .from(customEmojis)
            .where(and(eq(customEmojis.fileId, fileId), isNull(customEmojis.deletedAt)))
            .limit(1),
        executor
            .select({
                id: users.id,
            })
            .from(users)
            .where(eq(users.photoFileId, fileId))
            .limit(1),
        executor
            .select({
                id: chats.id,
            })
            .from(chats)
            .where(eq(chats.photoFileId, fileId))
            .limit(1),
        executor
            .select({
                id: serverSettings.id,
            })
            .from(serverSettings)
            .where(eq(serverSettings.photoFileId, fileId))
            .limit(1),
        executor
            .select({
                id: botIdentities.id,
            })
            .from(botIdentities)
            .where(eq(botIdentities.photoFileId, fileId))
            .limit(1),
        executor
            .select({
                id: chatBookmarks.id,
            })
            .from(chatBookmarks)
            .where(eq(chatBookmarks.fileId, fileId))
            .limit(1),
        executor
            .select({
                id: userBookmarks.id,
            })
            .from(userBookmarks)
            .where(eq(userBookmarks.fileId, fileId))
            .limit(1),
        executor
            .select({
                id: fileAccessGrants.id,
            })
            .from(fileAccessGrants)
            .where(eq(fileAccessGrants.fileId, fileId))
            .limit(1),
        executor
            .select({
                id: dataExportJobs.id,
            })
            .from(dataExportJobs)
            .where(
                and(
                    eq(dataExportJobs.outputFileId, fileId),
                    sql`${dataExportJobs.status} not in ('cancelled', 'expired')`,
                ),
            )
            .limit(1),
        executor
            .select({
                id: fileDerivatives.sourceFileId,
            })
            .from(fileDerivatives)
            .where(
                or(
                    eq(fileDerivatives.sourceFileId, fileId),
                    eq(fileDerivatives.derivedFileId, fileId),
                ),
            )
            .limit(1),
        executor
            .select({
                id: files.id,
            })
            .from(files)
            .where(or(eq(files.previewFileId, fileId), eq(files.thumbnailFileId, fileId)))
            .limit(1),
        executor
            .select({
                id: files.id,
            })
            .from(files)
            .where(
                and(
                    eq(files.id, fileId),
                    or(
                        sql`${files.previewFileId} is not null`,
                        sql`${files.thumbnailFileId} is not null`,
                    ),
                ),
            )
            .limit(1),
    ];
    for (const check of checks) if ((await check).length > 0) return true;
    return false;
}
