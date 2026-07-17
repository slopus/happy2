import { type ChatBookmarkSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatBookmarks } from "../schema.js";
import { chatHint } from "./chatHint.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { fileCanAccessWith } from "./fileCanAccessWith.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { messageRequireInChat } from "./messageRequireInChat.js";

/**
 * Adds a validated message or file target to the actor's chatBookmarks collection for an accessible chat.
 * Persisting authorized file linkage and the bookmark under one sync sequence prevents saved items from outliving the access check that admitted them.
 */
export async function chatBookmarkCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        kind: "link" | "message" | "file";
        title: string;
        url?: string;
        messageId?: string;
        fileId?: string;
        emoji?: string;
    },
): Promise<{
    bookmark: ChatBookmarkSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        if (access.archivedAt)
            throw new CollaborationError("forbidden", "Archived chats are read-only");
        if (input.kind === "message")
            await messageRequireInChat(tx, input.messageId!, input.chatId);
        if (
            input.kind === "file" &&
            !(await fileCanAccessWith(tx, input.actorUserId, input.fileId!))
        )
            throw new CollaborationError("not_found", "File was not found");
        const id = createId();
        const [next] = await tx
            .select({
                order: sql<number>`coalesce(max(${chatBookmarks.sortOrder}), -1) + 1`,
            })
            .from(chatBookmarks)
            .where(eq(chatBookmarks.chatId, input.chatId));
        const order = next?.order ?? 0;
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "bookmark.created",
            id,
        );
        await tx.insert(chatBookmarks).values({
            id,
            chatId: input.chatId,
            kind: input.kind,
            title: input.title,
            url: input.url,
            messageId: input.messageId,
            fileId: input.fileId,
            emoji: input.emoji,
            sortOrder: order,
            createdByUserId: input.actorUserId,
        });
        return {
            bookmark: {
                id,
                chatId: input.chatId,
                kind: input.kind,
                title: input.title,
                url: input.url,
                messageId: input.messageId,
                fileId: input.fileId,
                emoji: input.emoji,
                createdByUserId: input.actorUserId,
                sortOrder: order,
                createdAt: new Date().toISOString(),
            },
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
