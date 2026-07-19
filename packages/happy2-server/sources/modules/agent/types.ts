/** Durable checkpoint used to resume and periodically trim Rig's global event stream. */
export interface RigEventCheckpoint {
    cursor?: number;
    eventsSinceTrim: number;
    lastTrimmedAt: string;
    trimmedThrough?: number;
}

export type AgentTurnTraceKind =
    | "reasoning"
    | "response"
    | "tool"
    | "subagent"
    | "terminal"
    | "status";

export type AgentTurnTraceEntryStatus = "running" | "complete" | "failed";

/** One durable, coalesced span in an agent turn's execution history. */
export interface AgentTurnTraceUpdate {
    traceKey: string;
    sessionEventId: string;
    kind: AgentTurnTraceKind;
    title: string;
    detail?: string;
    status: AgentTurnTraceEntryStatus;
    occurredAt: number;
    completedAt?: number;
}

/** The live public projection of one Rig subagent belonging to a turn. */
export interface AgentTurnSubagentSummary {
    id: string;
    depth: number;
    description: string;
    status: "idle" | "queued" | "running" | "completed" | "aborted" | "suspended" | "error";
    latestText?: string;
    startedAt: number;
    totalTokens: number;
}

/** The live public projection of one background terminal belonging to a turn. */
export interface AgentTurnBackgroundTerminalSummary {
    id: string;
    command: string;
    cwd: string;
    startedAt: number;
}

export interface AgentTurnTraceEntrySummary {
    id: string;
    kind: AgentTurnTraceKind;
    title: string;
    detail?: string;
    status: AgentTurnTraceEntryStatus;
    occurredAt: number;
    completedAt?: number;
}

export interface AgentTurnTraceSummary {
    turnId: string;
    agentUserId: string;
    status: "pending" | "running" | "complete" | "failed";
    startedAt?: string;
    completedAt?: string;
    latest?: Omit<AgentTurnTraceEntrySummary, "id" | "status" | "completedAt">;
    entryCount: number;
    subagents: AgentTurnSubagentSummary[];
    backgroundTerminals: AgentTurnBackgroundTerminalSummary[];
}

export interface AgentTurnTraceDetails extends AgentTurnTraceSummary {
    entries: AgentTurnTraceEntrySummary[];
}
