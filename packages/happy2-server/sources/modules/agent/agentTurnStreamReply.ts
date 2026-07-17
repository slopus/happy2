import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MessageSummary, type MutationHint } from "../chat/types.js";

import { agentReplyMutationId } from "./impl/agentReplyMutationId.js";
import { agentTurns, messages } from "../schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chatHint } from "../chat/chatHint.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { messageSendInTransaction } from "../message/messageSendInTransaction.js";

/**
 * Applies the next leased turn output chunk to agentTurns and its visible messages projection in sequence order.
 * Committing checkpoint and chat delivery state together makes retries idempotent and keeps partial stream output resumable.
 */
export async function agentTurnStreamReply(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        actorUserId: string;
        eventId: string;
        expectedEventId?: string;
        sessionId: string;
        streamCommittedText: string;
        userMessageId: string;
        text: string;
        workerId: string;
    },
): Promise<{
    applied: boolean;
    message?: MessageSummary;
    hint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const [turn] = await tx
            .update(agentTurns)
            .set({
                lastSessionEventId: input.eventId,
                streamCommittedText: input.streamCommittedText,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentTurns.userMessageId, input.userMessageId),
                    eq(agentTurns.agentUserId, input.agentUserId),
                    eq(agentTurns.sessionId, input.sessionId),
                    eq(agentTurns.workerId, input.workerId),
                    eq(agentTurns.status, "running"),
                    input.expectedEventId === undefined
                        ? isNull(agentTurns.lastSessionEventId)
                        : eq(agentTurns.lastSessionEventId, input.expectedEventId),
                ),
            )
            .returning({
                assistantMessageId: agentTurns.assistantMessageId,
                chatId: agentTurns.chatId,
            });
        if (!turn)
            return {
                applied: false,
            };
        let created:
            | {
                  message: MessageSummary;
                  hint: MutationHint;
              }
            | undefined;
        let messageId = turn.assistantMessageId ?? undefined;
        if (!messageId && input.text.length > 0) {
            created = await messageSendInTransaction(tx, {
                actorUserId: input.actorUserId,
                agentSessionId: input.sessionId,
                chatId: turn.chatId,
                clientMutationId: agentReplyMutationId(input.sessionId, input.userMessageId),
                deferPublication: true,
                kind: "automated",
                text: input.text,
            });
            messageId = created.message.id;
            const linked = await tx
                .update(agentTurns)
                .set({
                    assistantMessageId: messageId,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, input.userMessageId),
                        eq(agentTurns.agentUserId, input.agentUserId),
                        eq(agentTurns.sessionId, input.sessionId),
                        eq(agentTurns.workerId, input.workerId),
                        eq(agentTurns.status, "running"),
                        eq(agentTurns.lastSessionEventId, input.eventId),
                    ),
                )
                .returning({
                    id: agentTurns.assistantMessageId,
                });
            if (linked.length !== 1) throw new Error("Agent turn reply could not be linked");
        }
        if (!messageId)
            return {
                applied: true,
            };
        const [messageRow] = await tx
            .select({
                text: messages.text,
            })
            .from(messages)
            .where(eq(messages.id, messageId))
            .limit(1);
        if (!messageRow) throw new Error("Agent turn reply is missing");
        if (messageRow.text === input.text) {
            if (!created)
                return {
                    applied: true,
                };
            const message = await messageGetProjection(tx, input.actorUserId, messageId);
            if (!message) throw new Error("Agent turn reply is not readable");
            return {
                applied: true,
                message,
                hint: created.hint,
            };
        }
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.agentUserId,
            turn.chatId,
            "message.streaming",
            messageId,
        );
        await tx
            .update(messages)
            .set({
                text: input.text,
                changePts: mutation.pts,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(messages.id, messageId));
        const message = await messageGetProjection(tx, input.actorUserId, messageId);
        if (!message) throw new Error("Streamed agent turn reply is not readable");
        return {
            applied: true,
            message,
            hint: chatHint(sequence, turn.chatId, mutation.pts),
        };
    });
}
