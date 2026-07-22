import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { MessageSummary, MutationHint } from "../chat/types.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatHint } from "../chat/chatHint.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
import { messageSendInTransaction } from "../message/messageSendInTransaction.js";
import { agentTurnTraceEntries, agentTurns, messages, users } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { agentReplyMutationId } from "./impl/agentReplyMutationId.js";

/**
 * Materializes the empty assistant reply, links agentTurns, and inserts the first agentTurnTraceEntries span for an active agent's worker-owned running turn.
 * Requiring users.active prevents stale sessions from creating output; authorized retries reuse the stable message identity and only publish when the trace had to be initialized.
 */
export async function agentTurnTraceStart(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        actorUserId: string;
        chatId: string;
        sessionId: string;
        startedAt: string;
        userMessageId: string;
        workerId: string;
    },
): Promise<{ message: MessageSummary; hint: MutationHint } | undefined> {
    return withTransaction(executor, async (tx) => {
        const [turn] = await tx
            .select({
                assistantMessageId: agentTurns.assistantMessageId,
                traceEntryCount: agentTurns.traceEntryCount,
            })
            .from(agentTurns)
            .innerJoin(users, eq(users.id, agentTurns.agentUserId))
            .where(
                and(
                    eq(agentTurns.userMessageId, input.userMessageId),
                    eq(agentTurns.agentUserId, input.agentUserId),
                    eq(agentTurns.sessionId, input.sessionId),
                    eq(agentTurns.workerId, input.workerId),
                    eq(agentTurns.status, "running"),
                    eq(users.kind, "agent"),
                    eq(users.active, 1),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (!turn || (turn.assistantMessageId && turn.traceEntryCount > 0)) return undefined;

        let messageId = turn.assistantMessageId ?? undefined;
        let hint: MutationHint;
        if (!messageId) {
            const created = await messageSendInTransaction(tx, {
                actorUserId: input.actorUserId,
                agentSessionId: input.sessionId,
                chatId: input.chatId,
                clientMutationId: agentReplyMutationId(input.sessionId, input.userMessageId),
                deferPublication: true,
                kind: "automated",
                text: "",
            });
            messageId = created.message.id;
            hint = created.hint;
        } else {
            const sequence = await syncSequenceNext(tx);
            const mutation = await chatAdvanceWithSequence(
                tx,
                sequence,
                input.agentUserId,
                input.chatId,
                "message.streaming",
                messageId,
            );
            await tx
                .update(messages)
                .set({ changePts: mutation.pts, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(messages.id, messageId));
            hint = chatHint(sequence, input.chatId, mutation.pts);
        }

        const occurredAt = Date.parse(input.startedAt);
        const linked = await tx
            .update(agentTurns)
            .set({
                assistantMessageId: messageId,
                traceLatestKind: "status",
                traceLatestTitle: "Starting turn",
                traceLatestDetail: null,
                traceLatestAt: occurredAt,
                traceEntryCount: 1,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentTurns.userMessageId, input.userMessageId),
                    eq(agentTurns.agentUserId, input.agentUserId),
                    eq(agentTurns.sessionId, input.sessionId),
                    eq(agentTurns.workerId, input.workerId),
                    eq(agentTurns.status, "running"),
                ),
            )
            .returning({ id: agentTurns.userMessageId });
        if (linked.length !== 1) throw new Error("Agent turn trace could not be linked");
        await tx
            .insert(agentTurnTraceEntries)
            .values({
                id: createId(),
                userMessageId: input.userMessageId,
                agentUserId: input.agentUserId,
                traceKey: "turn",
                sessionEventId: `turn-start:${input.startedAt}`,
                kind: "status",
                title: "Starting turn",
                status: "running",
                occurredAt,
            })
            .onConflictDoNothing();
        const message = await messageGetProjection(tx, input.actorUserId, messageId);
        if (!message) throw new Error("Agent turn trace message is not readable");
        return { message, hint };
    });
}
