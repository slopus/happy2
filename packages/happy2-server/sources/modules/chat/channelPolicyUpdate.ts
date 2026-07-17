import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chats } from "../schema.js";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";

/**
 * Updates the chats posting, joining, and visibility policy fields that the authorized channel manager explicitly supplied.
 * Advancing the channel version with the policy write ensures permission checks and subscribed clients converge on the same rules.
 */
export async function channelPolicyUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        retentionMode?: "inherit" | "forever" | "duration";
        retentionSeconds?: number | null;
        defaultExpiryMode?: "none" | "after_send" | "after_read";
        defaultSelfDestructSeconds?: number | null;
        defaultAfterReadScope?: "any_reader" | "all_readers";
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (
            input.retentionMode === "duration" &&
            input.retentionSeconds === undefined &&
            !access.retentionSeconds
        )
            throw new CollaborationError("invalid", "Duration retention requires seconds");
        if (
            input.defaultExpiryMode !== undefined &&
            input.defaultExpiryMode !== "none" &&
            input.defaultSelfDestructSeconds === undefined &&
            !access.defaultSelfDestructSeconds
        )
            throw new CollaborationError(
                "invalid",
                "The default self-destruct mode requires seconds",
            );
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "chat.policiesChanged",
            input.chatId,
        );
        await tx
            .update(chats)
            .set({
                ...(input.retentionMode === undefined
                    ? {}
                    : {
                          retentionMode: input.retentionMode,
                      }),
                ...(input.retentionSeconds === undefined
                    ? {}
                    : {
                          retentionSeconds: input.retentionSeconds,
                      }),
                ...(input.defaultExpiryMode === undefined
                    ? {}
                    : {
                          defaultExpiryMode: input.defaultExpiryMode,
                      }),
                ...(input.defaultSelfDestructSeconds === undefined
                    ? {}
                    : {
                          defaultSelfDestructSeconds: input.defaultSelfDestructSeconds,
                      }),
                ...(input.defaultAfterReadScope === undefined
                    ? {}
                    : {
                          defaultAfterReadScope: input.defaultAfterReadScope,
                      }),
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
