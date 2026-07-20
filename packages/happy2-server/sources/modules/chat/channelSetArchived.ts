import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chats } from "../schema.js";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";

/**
 * Archives or restores a manageable chats channel while protecting main and direct-message conversations from that transition.
 * Advancing every descendant at the same global sequence makes inherited parent archival immediately reconcile in child channels without overwriting each child's independent archive choice.
 */
export async function channelSetArchived(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        archived: boolean;
        reason?: string;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct messages cannot be archived");
        if (access.isMain && input.archived)
            throw new CollaborationError("invalid", "The main channel cannot be archived");
        const [stored] = await tx
            .select({ archivedAt: chats.archivedAt })
            .from(chats)
            .where(eq(chats.id, input.chatId))
            .limit(1);
        if (!stored) throw new CollaborationError("not_found", "Chat was not found");
        if (Boolean(stored.archivedAt) === input.archived)
            throw new CollaborationError(
                "conflict",
                input.archived ? "Channel is already archived" : "Channel is not archived",
            );
        const sequence = await syncSequenceNext(tx);
        const descendantIds = await chatDescendantIds(tx, input.chatId);
        const mutations = [];
        for (const chatId of [input.chatId, ...descendantIds])
            mutations.push(
                await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    chatId === input.chatId
                        ? input.archived
                            ? "chat.archived"
                            : "chat.unarchived"
                        : input.archived
                          ? "chat.parentArchived"
                          : "chat.parentUnarchived",
                    input.chatId,
                ),
            );
        await tx
            .update(chats)
            .set({
                archivedAt: input.archived ? sql`CURRENT_TIMESTAMP` : null,
                archivedByUserId: input.archived ? input.actorUserId : null,
                archiveReason: input.archived ? (input.reason ?? null) : null,
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, input.chatId));
        const chat = await chatRequireManager(tx, input.actorUserId, input.chatId);
        return {
            chat,
            hint: {
                sequence: String(sequence),
                chats: mutations.map((mutation) => ({
                    chatId: mutation.chatId,
                    pts: String(mutation.pts),
                })),
                areas: [],
            },
        };
    });
}
