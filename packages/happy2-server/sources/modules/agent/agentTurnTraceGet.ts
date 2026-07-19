import { and, asc, eq } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurnTraceEntries, agentTurns, messages } from "../schema.js";
import { asAgentTurnTrace } from "../chat/asAgentTurnTrace.js";
import { messageIsPast } from "../message/messageIsPast.js";
import type {
    AgentTurnTraceDetails,
    AgentTurnTraceEntryStatus,
    AgentTurnTraceKind,
} from "./types.js";

/**
 * Reads the complete coalesced execution trace linked to one visible assistant message after rechecking chat access and tombstone/expiry state.
 * Keeping trace visibility aligned with its message prevents deleted reasoning and tool details from bypassing the chat-content lifetime while avoiding inflation of every message projection.
 */
export async function agentTurnTraceGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    assistantMessageId: string,
): Promise<AgentTurnTraceDetails> {
    const [turn] = await executor
        .select({
            userMessageId: agentTurns.userMessageId,
            agentUserId: agentTurns.agentUserId,
            chatId: agentTurns.chatId,
            status: agentTurns.status,
            startedAt: agentTurns.startedAt,
            completedAt: agentTurns.completedAt,
            traceLatestKind: agentTurns.traceLatestKind,
            traceLatestTitle: agentTurns.traceLatestTitle,
            traceLatestDetail: agentTurns.traceLatestDetail,
            traceLatestAt: agentTurns.traceLatestAt,
            traceEntryCount: agentTurns.traceEntryCount,
            traceSubagentsJson: agentTurns.traceSubagentsJson,
            traceBackgroundTerminalsJson: agentTurns.traceBackgroundTerminalsJson,
            messageDeletedAt: messages.deletedAt,
            messageExpiresAt: messages.expiresAt,
        })
        .from(agentTurns)
        .innerJoin(messages, eq(messages.id, agentTurns.assistantMessageId))
        .where(eq(agentTurns.assistantMessageId, assistantMessageId))
        .limit(1);
    if (
        !turn ||
        turn.messageDeletedAt !== null ||
        messageIsPast(turn.messageExpiresAt ?? undefined) ||
        !(await chatGetAccess(executor, actorUserId, turn.chatId, false))
    )
        throw new CollaborationError("not_found", "Agent turn trace was not found");
    const entries = await executor
        .select({
            id: agentTurnTraceEntries.id,
            kind: agentTurnTraceEntries.kind,
            title: agentTurnTraceEntries.title,
            detail: agentTurnTraceEntries.detail,
            status: agentTurnTraceEntries.status,
            occurredAt: agentTurnTraceEntries.occurredAt,
            completedAt: agentTurnTraceEntries.completedAt,
        })
        .from(agentTurnTraceEntries)
        .where(
            and(
                eq(agentTurnTraceEntries.userMessageId, turn.userMessageId),
                eq(agentTurnTraceEntries.agentUserId, turn.agentUserId),
            ),
        )
        .orderBy(asc(agentTurnTraceEntries.occurredAt), asc(agentTurnTraceEntries.createdAt));
    return {
        ...asAgentTurnTrace(turn),
        entries: entries.flatMap((entry) => {
            const kind = traceKind(entry.kind);
            const status = traceEntryStatus(entry.status);
            if (!kind || !status) return [];
            return [
                {
                    id: entry.id,
                    kind,
                    title: entry.title,
                    ...(entry.detail ? { detail: entry.detail } : {}),
                    status,
                    occurredAt: entry.occurredAt,
                    ...(entry.completedAt === null ? {} : { completedAt: entry.completedAt }),
                },
            ];
        }),
    };
}

function traceKind(value: string): AgentTurnTraceKind | undefined {
    return value === "reasoning" ||
        value === "response" ||
        value === "tool" ||
        value === "subagent" ||
        value === "terminal" ||
        value === "status"
        ? value
        : undefined;
}

function traceEntryStatus(value: string): AgentTurnTraceEntryStatus | undefined {
    return value === "running" || value === "complete" || value === "failed" ? value : undefined;
}
