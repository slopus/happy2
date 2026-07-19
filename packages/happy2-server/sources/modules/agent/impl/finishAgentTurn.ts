import { type DrizzleExecutor, withTransaction } from "../../drizzle.js";
import { type MessageSummary, type MutationHint } from "../../chat/types.js";
import { createId } from "@paralleldrive/cuid2";

import { agentReplyMutationId } from "./agentReplyMutationId.js";
import { agentTurnTraceEntries, agentTurns, messages } from "../../schema.js";
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

const MAX_TRACE_DETAIL_CHARACTERS = 64 * 1_024;
const MAX_TRACE_SUMMARY_CHARACTERS = 500;

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
        const [lastTrace] = await tx
            .select({
                occurredAt: sql<number>`coalesce(max(${agentTurnTraceEntries.occurredAt}), 0)`,
            })
            .from(agentTurnTraceEntries)
            .where(
                and(
                    eq(agentTurnTraceEntries.userMessageId, input.userMessageId),
                    eq(agentTurnTraceEntries.agentUserId, input.agentUserId),
                ),
            );
        const occurredAt = Math.min(
            Number.MAX_SAFE_INTEGER,
            Math.max(Date.now(), Number(lastTrace?.occurredAt ?? 0) + 1),
        );
        const traceTitle = input.status === "complete" ? "Turn completed" : "Turn failed";
        const errorDetail = boundedTraceDetail(input.lastError);
        const [turn] = await tx
            .update(agentTurns)
            .set({
                status: input.status,
                lastError: errorDetail ?? null,
                workerId: null,
                leaseExpiresAt: null,
                completedAt: sql`CURRENT_TIMESTAMP`,
                traceLatestKind: "status",
                traceLatestTitle: traceTitle,
                traceLatestDetail: latestTraceLine(errorDetail) ?? null,
                traceLatestAt: occurredAt,
                traceSubagentsJson: "[]",
                traceBackgroundTerminalsJson: "[]",
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
        await tx
            .update(agentTurnTraceEntries)
            .set({
                status: input.status === "complete" ? "complete" : "failed",
                completedAt: occurredAt,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentTurnTraceEntries.userMessageId, input.userMessageId),
                    eq(agentTurnTraceEntries.agentUserId, input.agentUserId),
                    eq(agentTurnTraceEntries.status, "running"),
                ),
            );
        await tx.insert(agentTurnTraceEntries).values({
            id: createId(),
            userMessageId: input.userMessageId,
            agentUserId: input.agentUserId,
            traceKey: "turn-result",
            sessionEventId: `turn-result:${occurredAt}`,
            kind: "status",
            title: traceTitle,
            detail: errorDetail,
            status: input.status === "complete" ? "complete" : "failed",
            occurredAt,
            completedAt: occurredAt,
        });
        const [traceCount] = await tx
            .select({ value: sql<number>`count(*)` })
            .from(agentTurnTraceEntries)
            .where(
                and(
                    eq(agentTurnTraceEntries.userMessageId, input.userMessageId),
                    eq(agentTurnTraceEntries.agentUserId, input.agentUserId),
                ),
            );
        await tx
            .update(agentTurns)
            .set({ traceEntryCount: Number(traceCount?.value ?? 0) })
            .where(
                and(
                    eq(agentTurns.userMessageId, input.userMessageId),
                    eq(agentTurns.agentUserId, input.agentUserId),
                    eq(agentTurns.status, input.status),
                ),
            );
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

function boundedTraceDetail(value: string | undefined): string | undefined {
    const detail = value?.trim().slice(-MAX_TRACE_DETAIL_CHARACTERS);
    return detail || undefined;
}

function latestTraceLine(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const line = value
        .split(/\r?\n/u)
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1);
    return line?.slice(-MAX_TRACE_SUMMARY_CHARACTERS);
}
