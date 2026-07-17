import { type DrizzleExecutor, withTransaction } from "../../drizzle.js";
import { type MessageSummary, type MutationHint } from "../../chat/types.js";

import { agentReplyMutationId } from "./agentReplyMutationId.js";
import { agentTurns, messages } from "../../schema.js";
import { and, eq, sql } from "drizzle-orm";
import { chatHint } from "../../chat/chatHint.js";

import { chatAdvanceWithSequence } from "../../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../../chat/chatGetAccess.js";
import { messageGetProjection } from "../../message/messageGetProjection.js";
import { messageIndexForSearch } from "../../message/messageIndexForSearch.js";
import { syncSequenceNext } from "../../sync/syncSequenceNext.js";
import { messageRecordDelivery } from "../../message/messageRecordDelivery.js";
import { messageReplaceMentions } from "../../message/messageReplaceMentions.js";
import { messageSendInTransaction } from "../../message/messageSendInTransaction.js";

/**
 * Finalizes agentTurns and their messages output, including the terminal chat and search projections produced by the run.
 * The worker-facing transaction prevents a completed lease from being visible before its final answer is durable and searchable.
 */
export async function finishAgentTurn(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        actorUserId: string;
        eventKind: "message.completed" | "message.failed";
        lastError?: string;
        sessionId: string;
        status: "complete" | "failed";
        text: string;
        userMessageId: string;
        workerId: string;
    },
): Promise<
    | {
          message: MessageSummary;
          hint: MutationHint;
      }
    | undefined
> {
    return withTransaction(executor, async (tx) => {
        const [turn] = await tx
            .update(agentTurns)
            .set({
                status: input.status,
                lastError: input.lastError ?? null,
                workerId: null,
                leaseExpiresAt: null,
                completedAt: sql`CURRENT_TIMESTAMP`,
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
            .returning({
                assistantMessageId: agentTurns.assistantMessageId,
                chatId: agentTurns.chatId,
            });
        if (!turn) return undefined;
        let created:
            | {
                  message: MessageSummary;
                  hint: MutationHint;
              }
            | undefined;
        let messageId = turn.assistantMessageId ?? undefined;
        if (!messageId) {
            created = await messageSendInTransaction(tx, {
                actorUserId: input.actorUserId,
                agentSessionId: input.sessionId,
                chatId: turn.chatId,
                clientMutationId: agentReplyMutationId(input.sessionId, input.userMessageId),
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
                        eq(agentTurns.status, input.status),
                    ),
                )
                .returning({
                    id: agentTurns.assistantMessageId,
                });
            if (linked.length !== 1) throw new Error("Agent turn reply could not be linked");
        }
        const [messageRow] = await tx
            .select({
                publishedAt: messages.publishedAt,
                sequence: messages.sequence,
                text: messages.text,
            })
            .from(messages)
            .where(eq(messages.id, messageId))
            .limit(1);
        if (!messageRow) throw new Error("Agent turn reply is missing");
        if (created && messageRow.text === input.text) {
            const message = await messageGetProjection(tx, input.actorUserId, messageId);
            if (!message) throw new Error("Agent turn reply is not readable");
            return {
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
            input.eventKind,
            messageId,
        );
        await tx
            .update(messages)
            .set({
                text: input.text,
                changePts: mutation.pts,
                publishedAt: sql`coalesce(${messages.publishedAt}, CURRENT_TIMESTAMP)`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(messages.id, messageId));
        let mentions:
            | {
                  notifyAll: boolean;
                  userIds: string[];
              }
            | undefined;
        if (messageRow.text !== input.text || messageRow.publishedAt === null) {
            mentions = await messageReplaceMentions(tx, messageId, input.text);
            await messageIndexForSearch(tx, messageId, turn.chatId, input.text, 1);
        }
        if (messageRow.publishedAt === null) {
            const chat = await chatGetAccess(tx, input.actorUserId, turn.chatId, true);
            if (!chat) throw new Error("Agent turn chat is inaccessible");
            await messageRecordDelivery(tx, {
                actorUserId: input.actorUserId,
                chat,
                messageId,
                messageSequence: messageRow.sequence,
                mentionedUserIds: mentions?.userIds ?? [],
                mentionAll: mentions?.notifyAll,
                respectCurrentReadState: true,
                senderUserId: input.agentUserId,
                syncSequence: sequence,
            });
        }
        const message = await messageGetProjection(tx, input.actorUserId, messageId);
        if (!message) throw new Error("Finished agent turn reply is not readable");
        return {
            message,
            hint: chatHint(sequence, turn.chatId, mutation.pts),
        };
    });
}
