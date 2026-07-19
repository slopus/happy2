import { type ReactNode } from "react";
import { AgentTracePanel, type AgentTracePanelEntry } from "../../src/AgentTracePanel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
/* Deterministic fixed timestamps (UTC) — the panel formats HH:MM:SS in UTC. */
const T0 = Date.UTC(2026, 5, 12, 14, 3, 7);
const entries: readonly AgentTracePanelEntry[] = [
    {
        id: "e-1",
        kind: "status",
        title: "Turn started",
        status: "complete",
        occurredAt: T0,
    },
    {
        id: "e-2",
        kind: "reasoning",
        title: "Thinking",
        detail: "planning the trace panel layout",
        status: "complete",
        occurredAt: T0 + 4_000,
    },
    {
        id: "e-3",
        kind: "subagent",
        title: "Explore server routes",
        detail: "searching for the turn-trace persistence actions",
        status: "complete",
        occurredAt: T0 + 11_000,
        completedAt: T0 + 74_000,
    },
    {
        id: "e-4",
        kind: "tool",
        title: "Read",
        detail: "packages/happy2-server/sources/modules/schema.ts",
        status: "complete",
        occurredAt: T0 + 21_000,
    },
    {
        id: "e-5",
        kind: "terminal",
        title: "Terminal",
        detail: "pnpm --dir packages/happy2-server architecture:check",
        status: "failed",
        occurredAt: T0 + 48_000,
    },
    {
        id: "e-6",
        kind: "tool",
        title: "Edit",
        detail: "sources/modules/traces/traceAppendEntry.ts",
        status: "complete",
        occurredAt: T0 + 63_000,
    },
    {
        id: "e-7",
        kind: "response",
        title: "Drafting response",
        status: "running",
        occurredAt: T0 + 88_000,
    },
    {
        id: "e-8",
        kind: "status",
        title: "Waiting on background terminal",
        status: "running",
        occurredAt: T0 + 92_000,
    },
];
/* The 288px standard-sidebar frame the panel occupies in the shell. */
function panelFrame(children: ReactNode, height = 520) {
    return (
        <div
            style={{
                background: "var(--happy2-bg-surface)",
                border: "1px solid var(--happy2-border)",
                display: "flex",
                flexDirection: "column",
                height: `${height}px`,
                overflow: "hidden",
                width: "288px",
            }}
        >
            {children}
        </div>
    );
}
export function AgentTracePanelPage() {
    return (
        <ComponentPage
            number="C-068"
            summary="The right-sidebar activity trace for one agent turn: a 52px surface header with status badge, then a full-bleed scrolling activity log keyed by entry."
            title="Agent trace panel"
        >
            <Specimen
                detail="52px header · status badge · 12px inset entries · UTC HH:MM:SS timestamps"
                label="Running trace"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {panelFrame(
                        <AgentTracePanel
                            entries={entries}
                            entryCount={entries.length}
                            onClose={() => {}}
                            status="running"
                            title="Codey"
                        />,
                    )}
                    <DimensionRule label="288 px panel · 52 px header · 12 px entry gap" />
                </div>
            </Specimen>

            <Specimen
                detail="Centered muted loading text while the durable trace loads"
                label="Loading"
                number="02"
                stage="app"
            >
                {panelFrame(
                    <AgentTracePanel
                        entries={[]}
                        entryCount={0}
                        loading
                        onClose={() => {}}
                        status="pending"
                        title="Codey"
                    />,
                    240,
                )}
            </Specimen>

            <Specimen
                detail="Centered danger text when the trace cannot be loaded"
                label="Error"
                number="03"
                stage="app"
            >
                {panelFrame(
                    <AgentTracePanel
                        entries={[]}
                        entryCount={0}
                        error="Could not load activity for this turn."
                        onClose={() => {}}
                        status="failed"
                        title="Codey"
                    />,
                    240,
                )}
            </Specimen>

            <Specimen
                detail="Centered muted empty text for a turn with no recorded activity"
                label="Empty"
                number="04"
                stage="app"
            >
                {panelFrame(
                    <AgentTracePanel
                        entries={[]}
                        entryCount={0}
                        onClose={() => {}}
                        status="complete"
                        title="Codey"
                    />,
                    240,
                )}
            </Specimen>
        </ComponentPage>
    );
}
