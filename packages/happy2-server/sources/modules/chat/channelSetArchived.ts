import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { agentTurnTraceEntries, agentTurns, chats, serverSyncState } from "../schema.js";
import { and, eq, inArray, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";

/**
 * Archives or restores a manageable chat while protecting the main channel.
 * Archival terminalizes queued and running turns in the same transaction, so a
 * completion race either wins before the archive or observes an authoritative
 * stopped turn after it. The route first aborts locally owned execution.
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
        if (access.isMain && input.archived)
            throw new CollaborationError("invalid", "The main channel cannot be archived");
        if (access.isDefaultAgentConversation && input.archived)
            throw new CollaborationError(
                "invalid",
                "The required default agent conversation cannot be archived",
            );
        if (Boolean(access.archivedAt) === input.archived) {
            const [sync] = await tx
                .select({ sequence: serverSyncState.sequence })
                .from(serverSyncState)
                .where(eq(serverSyncState.id, 1));
            if (!sync) throw new Error("Sync state is not initialized");
            return {
                chat: access,
                hint: chatHint(sync.sequence, input.chatId, Number(access.pts)),
            };
        }
        const sequence = await syncSequenceNext(tx);
        if (input.archived) {
            const occurredAt = Date.now();
            await tx
                .update(agentTurns)
                .set({
                    status: "failed",
                    lastError: "Chat archived by a manager.",
                    workerId: null,
                    leaseExpiresAt: null,
                    completedAt: sql`CURRENT_TIMESTAMP`,
                    traceLatestKind: "status",
                    traceLatestTitle: "Turn aborted",
                    traceLatestDetail: "Chat archived by a manager.",
                    traceLatestAt: occurredAt,
                    traceSubagentsJson: "[]",
                    traceBackgroundTerminalsJson: "[]",
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurns.chatId, input.chatId),
                        inArray(agentTurns.status, ["pending", "running"]),
                    ),
                );
            await tx
                .update(agentTurnTraceEntries)
                .set({
                    status: "failed",
                    completedAt: occurredAt,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurnTraceEntries.status, "running"),
                        sql`EXISTS (
                            SELECT 1 FROM ${agentTurns}
                            WHERE ${agentTurns.userMessageId} = ${agentTurnTraceEntries.userMessageId}
                              AND ${agentTurns.agentUserId} = ${agentTurnTraceEntries.agentUserId}
                              AND ${agentTurns.chatId} = ${input.chatId}
                        )`,
                    ),
                );
        }
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
