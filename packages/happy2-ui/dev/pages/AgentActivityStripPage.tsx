import { type CSSProperties } from "react";
import { AgentActivityStrip } from "../../src/AgentActivityStrip";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
/* Deterministic clock: every elapsed value derives from this fixed instant. */
const NOW = Date.UTC(2026, 5, 12, 14, 30, 0);
const column: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    alignItems: "flex-start",
};
const composerFrame: CSSProperties = {
    background: "var(--groupped-background)",
    border: "1px solid var(--divider)",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px",
    width: "560px",
};
export function AgentActivityStripPage() {
    return (
        <ComponentPage
            number="C-066"
            summary="A dense, TUI-like live strip above the chat composer while an agent turn runs: one 24px row per active subagent and background terminal, with mono token and elapsed meta."
            title="Agent activity strip"
        >
            <Specimen
                detail="Hairline card on the code surface · 24px rows · 4px row gap · right-pinned mono meta"
                label="Subagents and terminals"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <div style={composerFrame}>
                        <AgentActivityStrip
                            now={NOW}
                            subagents={[
                                {
                                    id: "sa-explore",
                                    description: "Explore server routes",
                                    status: "running",
                                    latestText: 'grep -rn "sessionCreate" sources/modules',
                                    startedAt: NOW - 45_000,
                                    totalTokens: 12_345,
                                },
                                {
                                    id: "sa-gym",
                                    description: "Write gym coverage",
                                    status: "completed",
                                    latestText: "Done: 4 files changed",
                                    startedAt: NOW - 125_000,
                                    totalTokens: 1_234,
                                },
                                {
                                    id: "sa-lint",
                                    description: "Fix lints",
                                    status: "error",
                                    startedAt: NOW - 9_000,
                                    totalTokens: 999,
                                },
                                {
                                    id: "sa-docs",
                                    description: "Draft release notes",
                                    status: "queued",
                                    startedAt: NOW,
                                    totalTokens: 0,
                                },
                            ]}
                            terminals={[
                                {
                                    id: "term-test",
                                    command: "pnpm --dir packages/happy2-server test",
                                    cwd: "~/work/happy2",
                                    startedAt: NOW - 30_000,
                                },
                                {
                                    id: "term-dev",
                                    command: "pnpm dev",
                                    cwd: "~/work/happy2/packages/happy2-ui",
                                    startedAt: NOW - 600_000,
                                },
                            ]}
                        />
                        <div
                            style={{
                                background: "var(--surface)",
                                border: "1px solid var(--divider)",
                                borderRadius: "8px",
                                color: "var(--text-secondary)",
                                font: "500 13px var(--happy2-font-ui)",
                                padding: "10px 12px",
                            }}
                        >
                            Message Codey…
                        </div>
                    </div>
                    <DimensionRule label="24 px rows · 4 px gap · 8 px side padding" />
                </div>
            </Specimen>

            <Specimen
                detail="One background terminal, no subagents"
                label="Single terminal"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <div style={{ display: "flex", width: "420px" }}>
                        <AgentActivityStrip
                            now={NOW}
                            style={{ flex: "1 1 auto", minWidth: 0 }}
                            subagents={[]}
                            terminals={[
                                {
                                    id: "term-build",
                                    command: "cargo build --release",
                                    cwd: "~/work/relay",
                                    startedAt: NOW - 754_000,
                                },
                            ]}
                        />
                    </div>
                    <DimensionRule label="420 px · one 24 px row" />
                </div>
            </Specimen>

            <Specimen
                detail="Twelve rows overflow the 144px card cap and scroll inside the full-bleed scrollport, so the composer below never moves"
                label="Capped overflow"
                number="03"
                stage="surface"
            >
                <div style={column}>
                    <div style={{ display: "flex", width: "560px" }}>
                        <AgentActivityStrip
                            now={NOW}
                            style={{ flex: "1 1 auto", minWidth: 0 }}
                            subagents={Array.from({ length: 8 }, (_, index) => ({
                                id: `sa-batch-${index}`,
                                description: `Review module ${index + 1} of 8`,
                                status: index < 6 ? ("running" as const) : ("queued" as const),
                                latestText: `checking sources/modules/area-${index + 1}`,
                                startedAt: NOW - (index + 1) * 15_000,
                                totalTokens: (index + 1) * 850,
                            }))}
                            terminals={Array.from({ length: 4 }, (_, index) => ({
                                id: `term-batch-${index}`,
                                command: `pnpm run watch-${index + 1}`,
                                cwd: `~/work/happy2/packages/job-${index + 1}`,
                                startedAt: NOW - (index + 1) * 60_000,
                            }))}
                        />
                    </div>
                    <DimensionRule label="144 px max height · internal scrollport" />
                </div>
            </Specimen>

            <Specimen
                detail="280px column: description, latest output, and cwd all truncate with a plain ellipsis"
                label="Narrow truncation"
                number="04"
                stage="surface"
            >
                <div style={column}>
                    <div style={{ display: "flex", width: "280px" }}>
                        <AgentActivityStrip
                            now={NOW}
                            style={{ flex: "1 1 auto", minWidth: 0 }}
                            subagents={[
                                {
                                    id: "sa-long",
                                    description:
                                        "Investigate the flaky realtime reconnect behavior across engines",
                                    status: "running",
                                    latestText:
                                        "vitest run src/realtime/reconnect.test.ts --browser.name=webkit",
                                    startedAt: NOW - 245_000,
                                    totalTokens: 48_300,
                                },
                            ]}
                            terminals={[
                                {
                                    id: "term-long",
                                    command:
                                        "pnpm --dir packages/happy2-gym test tests/server/session-refresh",
                                    cwd: "~/conductor/workspaces/happy2/yokohama-v1/packages/happy2-gym",
                                    startedAt: NOW - 30_000,
                                },
                            ]}
                        />
                    </div>
                    <DimensionRule label="280 px · ellipsis truncation, no rtl" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
