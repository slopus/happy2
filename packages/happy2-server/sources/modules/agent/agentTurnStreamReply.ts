import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MessageSummary, type MutationHint } from "../chat/types.js";
import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import type {
    AgentTurnBackgroundTerminalSummary,
    AgentTurnSubagentSummary,
    AgentTurnTraceUpdate,
} from "./types.js";

import { agentReplyMutationId } from "./impl/agentReplyMutationId.js";
import { agentTurnTraceEntries, agentTurns, messages } from "../schema.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { chatHint } from "../chat/chatHint.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { messageSendInTransaction } from "../message/messageSendInTransaction.js";
import { agentActiveExists } from "./impl/agentActiveExists.js";

const MAX_AGENT_TURN_TRACE_ENTRIES = 512;
const MAX_STREAM_TRACE_ENTRIES = MAX_AGENT_TURN_TRACE_ENTRIES - 1;
const MAX_TRACE_COLLECTION_ITEMS = 32;
const MAX_TRACE_DETAIL_CHARACTERS = 64 * 1_024;
const MAX_TRACE_SUMMARY_CHARACTERS = 500;
const MAX_TRACE_ID_CHARACTERS = 128;
const MAX_TRACE_KEY_CHARACTERS = 512;

/**
 * Applies the next leased active-agent output chunk to agentTurns and its visible messages projection in sequence order.
 * Requiring users.active while committing checkpoint and chat delivery state prevents deactivated sessions from publishing and keeps authorized partial output resumable.
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
        traceUpdates: readonly AgentTurnTraceUpdate[];
        subagents?: readonly AgentTurnSubagentSummary[];
        backgroundTerminals?: readonly AgentTurnBackgroundTerminalSummary[];
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
                    agentActiveExists(tx, input.agentUserId),
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
        const traceUpdates = normalizeTraceUpdates(input.traceUpdates);
        const subagents = normalizeSubagents(input.subagents);
        const backgroundTerminals = normalizeBackgroundTerminals(input.backgroundTerminals);
        let entryCount = await traceEntryCount(tx, input.userMessageId, input.agentUserId);
        const persistedTraceUpdates: AgentTurnTraceUpdate[] = [];
        if (traceUpdates.length > 0) {
            await tx
                .update(agentTurnTraceEntries)
                .set({
                    status: "complete",
                    completedAt: traceUpdates[0]!.occurredAt,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurnTraceEntries.userMessageId, input.userMessageId),
                        eq(agentTurnTraceEntries.agentUserId, input.agentUserId),
                        eq(agentTurnTraceEntries.traceKey, "turn"),
                        eq(agentTurnTraceEntries.status, "running"),
                    ),
                );
            const existingKeys = new Set(
                (
                    await tx
                        .select({ traceKey: agentTurnTraceEntries.traceKey })
                        .from(agentTurnTraceEntries)
                        .where(
                            and(
                                eq(agentTurnTraceEntries.userMessageId, input.userMessageId),
                                eq(agentTurnTraceEntries.agentUserId, input.agentUserId),
                                inArray(
                                    agentTurnTraceEntries.traceKey,
                                    traceUpdates.map(({ traceKey }) => traceKey),
                                ),
                            ),
                        )
                ).map(({ traceKey }) => traceKey),
            );
            for (const trace of traceUpdates) {
                const exists = existingKeys.has(trace.traceKey);
                if (!exists && entryCount >= MAX_STREAM_TRACE_ENTRIES) continue;
                await tx
                    .insert(agentTurnTraceEntries)
                    .values({
                        id: createId(),
                        userMessageId: input.userMessageId,
                        agentUserId: input.agentUserId,
                        traceKey: trace.traceKey,
                        sessionEventId: trace.sessionEventId,
                        kind: trace.kind,
                        title: trace.title,
                        detail: trace.detail,
                        status: trace.status,
                        occurredAt: trace.occurredAt,
                        completedAt: trace.completedAt,
                    })
                    .onConflictDoUpdate({
                        target: [
                            agentTurnTraceEntries.userMessageId,
                            agentTurnTraceEntries.agentUserId,
                            agentTurnTraceEntries.traceKey,
                        ],
                        set: {
                            sessionEventId: trace.sessionEventId,
                            kind: trace.kind,
                            title: trace.title,
                            detail: trace.detail,
                            status: trace.status,
                            occurredAt: sql`min(${agentTurnTraceEntries.occurredAt}, ${trace.occurredAt})`,
                            completedAt: trace.completedAt,
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        },
                    });
                persistedTraceUpdates.push(trace);
                if (!exists) {
                    existingKeys.add(trace.traceKey);
                    entryCount += 1;
                }
            }
        }
        const traceChanged =
            persistedTraceUpdates.length > 0 ||
            input.subagents !== undefined ||
            input.backgroundTerminals !== undefined;
        if (traceChanged) {
            const latest = persistedTraceUpdates.reduce<AgentTurnTraceUpdate | undefined>(
                (current, trace) =>
                    !current || trace.occurredAt >= current.occurredAt ? trace : current,
                undefined,
            );
            await tx
                .update(agentTurns)
                .set({
                    ...(latest
                        ? {
                              traceLatestKind: latest.kind,
                              traceLatestTitle: latest.title,
                              traceLatestDetail: latestTraceLine(latest.detail) ?? null,
                              traceLatestAt: latest.occurredAt,
                          }
                        : {}),
                    traceEntryCount: entryCount,
                    ...(input.subagents === undefined
                        ? {}
                        : { traceSubagentsJson: JSON.stringify(subagents) }),
                    ...(input.backgroundTerminals === undefined
                        ? {}
                        : {
                              traceBackgroundTerminalsJson: JSON.stringify(backgroundTerminals),
                          }),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, input.userMessageId),
                        eq(agentTurns.agentUserId, input.agentUserId),
                        eq(agentTurns.workerId, input.workerId),
                        eq(agentTurns.status, "running"),
                        eq(agentTurns.lastSessionEventId, input.eventId),
                    ),
                );
        }
        let created:
            | {
                  message: MessageSummary;
                  hint: MutationHint;
              }
            | undefined;
        let messageId = turn.assistantMessageId ?? undefined;
        if (!messageId && (input.text.length > 0 || traceChanged)) {
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
        if (created && messageRow.text === input.text) {
            const message = await messageGetProjection(tx, input.actorUserId, messageId);
            if (!message) throw new Error("Agent turn reply is not readable");
            return {
                applied: true,
                message,
                hint: created.hint,
            };
        }
        if (messageRow.text === input.text && !traceChanged) {
            return {
                applied: true,
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
                ...(messageRow.text === input.text ? {} : { text: input.text }),
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

async function traceEntryCount(
    executor: DrizzleExecutor,
    userMessageId: string,
    agentUserId: string,
): Promise<number> {
    const [count] = await executor
        .select({ value: sql<number>`count(*)` })
        .from(agentTurnTraceEntries)
        .where(
            and(
                eq(agentTurnTraceEntries.userMessageId, userMessageId),
                eq(agentTurnTraceEntries.agentUserId, agentUserId),
            ),
        );
    return Math.min(MAX_AGENT_TURN_TRACE_ENTRIES, Math.max(0, Number(count?.value ?? 0)));
}

function normalizeTraceUpdates(values: readonly AgentTurnTraceUpdate[]): AgentTurnTraceUpdate[] {
    const updates = new Map<string, AgentTurnTraceUpdate>();
    for (const value of values.slice(0, MAX_AGENT_TURN_TRACE_ENTRIES)) {
        const traceKey = boundedIdentifier(value.traceKey, "trace", MAX_TRACE_KEY_CHARACTERS);
        const occurredAt = boundedTimestamp(value.occurredAt);
        const detail = boundedText(value.detail, MAX_TRACE_DETAIL_CHARACTERS);
        const normalized: AgentTurnTraceUpdate = {
            traceKey,
            sessionEventId: boundedIdentifier(
                value.sessionEventId,
                "event",
                MAX_TRACE_KEY_CHARACTERS,
            ),
            kind: value.kind,
            title: boundedText(value.title, MAX_TRACE_SUMMARY_CHARACTERS) ?? "Agent activity",
            ...(detail ? { detail } : {}),
            status: value.status,
            occurredAt,
            ...(value.completedAt === undefined
                ? {}
                : { completedAt: Math.max(occurredAt, boundedTimestamp(value.completedAt)) }),
        };
        updates.delete(traceKey);
        updates.set(traceKey, normalized);
    }
    return [...updates.values()];
}

function normalizeSubagents(
    values: readonly AgentTurnSubagentSummary[] | undefined,
): AgentTurnSubagentSummary[] | undefined {
    if (values === undefined) return undefined;
    const normalized = new Map<string, AgentTurnSubagentSummary>();
    for (const value of values.slice(0, MAX_TRACE_COLLECTION_ITEMS)) {
        const id = boundedIdentifier(value.id, "subagent", MAX_TRACE_ID_CHARACTERS);
        const latestText = boundedText(value.latestText, MAX_TRACE_SUMMARY_CHARACTERS);
        normalized.set(id, {
            id,
            depth: boundedInteger(value.depth, 1),
            description: boundedText(value.description, MAX_TRACE_SUMMARY_CHARACTERS) ?? "Subagent",
            status: value.status,
            ...(latestText ? { latestText } : {}),
            startedAt: boundedTimestamp(value.startedAt),
            totalTokens: boundedInteger(value.totalTokens, 0),
        });
    }
    return [...normalized.values()];
}

function normalizeBackgroundTerminals(
    values: readonly AgentTurnBackgroundTerminalSummary[] | undefined,
): AgentTurnBackgroundTerminalSummary[] | undefined {
    if (values === undefined) return undefined;
    const normalized = new Map<string, AgentTurnBackgroundTerminalSummary>();
    for (const value of values.slice(0, MAX_TRACE_COLLECTION_ITEMS)) {
        const id = boundedIdentifier(value.id, "terminal", MAX_TRACE_ID_CHARACTERS);
        normalized.set(id, {
            id,
            command:
                boundedText(value.command, MAX_TRACE_SUMMARY_CHARACTERS) ?? "Background command",
            cwd: boundedText(value.cwd, MAX_TRACE_SUMMARY_CHARACTERS) ?? ".",
            startedAt: boundedTimestamp(value.startedAt),
        });
    }
    return [...normalized.values()];
}

function boundedIdentifier(value: string, prefix: string, maximum: number): string {
    const clean = [...value]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code > 31 && code !== 127;
        })
        .join("");
    if (clean.length > 0 && clean.length <= maximum) return clean;
    return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function boundedText(value: string | undefined, maximum: number): string | undefined {
    const text = value?.trim().slice(-maximum);
    return text || undefined;
}

function boundedTimestamp(value: number): number {
    const now = Date.now();
    return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, now) : now;
}

function boundedInteger(value: number, minimum: number): number {
    return Number.isSafeInteger(value)
        ? Math.max(minimum, Math.min(value, Number.MAX_SAFE_INTEGER))
        : minimum;
}

function latestTraceLine(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const line = value
        .split(/\r?\n/u)
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1);
    return line?.slice(-500);
}
