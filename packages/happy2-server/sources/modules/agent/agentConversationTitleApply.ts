import { and, eq, isNull, sql } from "drizzle-orm";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatHint } from "../chat/chatHint.js";
import { type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentRigBindings, chats } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

const MAX_RIG_SESSION_TITLE_CHARACTERS = 200;

/**
 * Applies Rig's latest generated session title to the exact bound direct-agent conversation by updating chats and its chatUpdates/syncEvents coordinates atomically.
 * Ignoring missing, channel, unchanged, and blank bindings keeps Rig metadata from renaming unrelated product conversations or emitting duplicate sync work.
 */
export async function agentConversationTitleApply(
    executor: DrizzleExecutor,
    input: { sessionId: string; title: string },
): Promise<MutationHint | undefined> {
    const title = [...input.title.trim()].slice(0, MAX_RIG_SESSION_TITLE_CHARACTERS).join("");
    if (!title) return undefined;
    return withTransaction(executor, async (tx) => {
        const [conversation] = await tx
            .select({ chatId: chats.id, title: chats.name })
            .from(agentRigBindings)
            .innerJoin(chats, eq(chats.id, agentRigBindings.chatId))
            .where(
                and(
                    eq(agentRigBindings.sessionId, input.sessionId),
                    eq(chats.kind, "dm"),
                    eq(chats.dmType, "direct"),
                    isNull(chats.deletedAt),
                ),
            )
            .limit(1);
        if (!conversation || conversation.title === title) return undefined;

        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            undefined,
            conversation.chatId,
            "chat.updated",
            conversation.chatId,
        );
        await tx
            .update(chats)
            .set({
                name: title,
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, conversation.chatId));
        return chatHint(sequence, conversation.chatId, mutation.pts);
    });
}
