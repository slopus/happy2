import { and, eq, sql } from "drizzle-orm";
import type { MutationHint } from "../../chat/types.js";
import { chatAdvanceWithSequence } from "../../chat/chatAdvanceWithSequence.js";
import { chatHint } from "../../chat/chatHint.js";
import type { DrizzleTransaction } from "../../drizzle.js";
import { agentTurns, messages } from "../../schema.js";
import { syncSequenceNext } from "../../sync/syncSequenceNext.js";

/** Advances the owning assistant message when an already-linked MCP App changes. */
export async function pluginMcpAppMessageChanged(
    tx: DrizzleTransaction,
    input: { sessionId: string; userMessageId: string; agentUserId: string },
): Promise<MutationHint | undefined> {
    const [turn] = await tx
        .select({ assistantMessageId: agentTurns.assistantMessageId, chatId: agentTurns.chatId })
        .from(agentTurns)
        .where(
            and(
                eq(agentTurns.sessionId, input.sessionId),
                eq(agentTurns.userMessageId, input.userMessageId),
                eq(agentTurns.agentUserId, input.agentUserId),
            ),
        )
        .limit(1);
    if (!turn?.assistantMessageId) return undefined;
    const sequence = await syncSequenceNext(tx);
    const mutation = await chatAdvanceWithSequence(
        tx,
        sequence,
        input.agentUserId,
        turn.chatId,
        "message.updated",
        turn.assistantMessageId,
    );
    await tx
        .update(messages)
        .set({ changePts: mutation.pts, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(messages.id, turn.assistantMessageId));
    return chatHint(sequence, turn.chatId, mutation.pts);
}
