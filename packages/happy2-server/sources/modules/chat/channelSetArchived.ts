import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chats } from "../schema.js";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";

/**
 * Archives or restores a manageable chats channel while protecting main and direct-message conversations from that transition.
 * The synchronized channel point makes posting eligibility change at the same durable version every member receives.
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
        if (Boolean(access.archivedAt) === input.archived)
            throw new CollaborationError(
                "conflict",
                input.archived ? "Channel is already archived" : "Channel is not archived",
            );
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            input.archived ? "chat.archived" : "chat.unarchived",
            input.chatId,
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
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
