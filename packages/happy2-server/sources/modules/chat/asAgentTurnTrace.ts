import type {
    AgentTurnBackgroundTerminalSummary,
    AgentTurnSubagentSummary,
    AgentTurnTraceKind,
    AgentTurnTraceSummary,
} from "../agent/types.js";

export interface AgentTurnTraceRow {
    userMessageId: string;
    agentUserId: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    traceLatestKind: string | null;
    traceLatestTitle: string | null;
    traceLatestDetail: string | null;
    traceLatestAt: number | null;
    traceEntryCount: number;
    traceSubagentsJson: string;
    traceBackgroundTerminalsJson: string;
}

export function asAgentTurnTrace(row: AgentTurnTraceRow): AgentTurnTraceSummary {
    const latestKind = traceKind(row.traceLatestKind);
    const latest =
        latestKind && row.traceLatestTitle && row.traceLatestAt !== null
            ? {
                  kind: latestKind,
                  title: row.traceLatestTitle,
                  ...(row.traceLatestDetail ? { detail: row.traceLatestDetail } : {}),
                  occurredAt: row.traceLatestAt,
              }
            : undefined;
    return {
        turnId: row.userMessageId,
        agentUserId: row.agentUserId,
        status: traceStatus(row.status),
        ...(row.startedAt ? { startedAt: row.startedAt } : {}),
        ...(row.completedAt ? { completedAt: row.completedAt } : {}),
        ...(latest ? { latest } : {}),
        entryCount: Math.max(0, row.traceEntryCount),
        subagents: subagents(row.traceSubagentsJson),
        backgroundTerminals: backgroundTerminals(row.traceBackgroundTerminalsJson),
    };
}

function traceStatus(value: string): AgentTurnTraceSummary["status"] {
    return value === "running" || value === "complete" || value === "failed" ? value : "pending";
}

function traceKind(value: string | null): AgentTurnTraceKind | undefined {
    return value === "reasoning" ||
        value === "response" ||
        value === "tool" ||
        value === "subagent" ||
        value === "terminal" ||
        value === "status"
        ? value
        : undefined;
}

function subagents(json: string): AgentTurnSubagentSummary[] {
    return array(json).flatMap((value) => {
        if (!record(value)) return [];
        const status = value.status;
        if (
            status !== "idle" &&
            status !== "queued" &&
            status !== "running" &&
            status !== "completed" &&
            status !== "aborted" &&
            status !== "suspended" &&
            status !== "error"
        )
            return [];
        if (
            typeof value.id !== "string" ||
            typeof value.depth !== "number" ||
            typeof value.description !== "string" ||
            typeof value.startedAt !== "number" ||
            typeof value.totalTokens !== "number"
        )
            return [];
        return [
            {
                id: value.id,
                depth: value.depth,
                description: value.description,
                status,
                ...(typeof value.latestText === "string" ? { latestText: value.latestText } : {}),
                startedAt: value.startedAt,
                totalTokens: value.totalTokens,
            },
        ];
    });
}

function backgroundTerminals(json: string): AgentTurnBackgroundTerminalSummary[] {
    return array(json).flatMap((value) => {
        if (
            !record(value) ||
            typeof value.id !== "string" ||
            typeof value.command !== "string" ||
            typeof value.cwd !== "string" ||
            typeof value.startedAt !== "number"
        )
            return [];
        return [
            {
                id: value.id,
                command: value.command,
                cwd: value.cwd,
                startedAt: value.startedAt,
            },
        ];
    });
}

function array(json: string): unknown[] {
    try {
        const value: unknown = JSON.parse(json);
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
