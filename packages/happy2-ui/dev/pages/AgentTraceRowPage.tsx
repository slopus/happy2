import { type CSSProperties } from "react";
import { AgentTraceRow } from "../../src/AgentTraceRow";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const column: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "420px",
};
export function AgentTraceRowPage() {
    return (
        <ComponentPage
            number="C-067"
            summary="A compact single-line clickable activity row inside an assistant message: latest activity while the turn runs, then a View-trace link row with the step count."
            title="Agent trace row"
        >
            <Specimen
                detail="28px button row · static accent dot · kind glyph · mono detail · mono entry count"
                label="Running"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={column}>
                        <AgentTraceRow
                            detail="evaluating layout constraints for the trace panel"
                            entryCount={12}
                            kind="reasoning"
                            status="running"
                            title="Thinking"
                        />
                        <AgentTraceRow
                            detail="pnpm --dir packages/happy2-ui typecheck"
                            entryCount={4}
                            kind="tool"
                            status="running"
                            title="Bash"
                        />
                        <AgentTraceRow
                            entryCount={7}
                            kind="subagent"
                            status="running"
                            title="Explore server routes"
                        />
                    </div>
                    <DimensionRule label="420 px wide · 28 px high" />
                </div>
            </Specimen>

            <Specimen
                detail="Success and danger dots · accent View trace link · step count"
                label="Complete, failed, and open"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={column}>
                        <AgentTraceRow entryCount={12} status="complete" />
                        <AgentTraceRow entryCount={3} status="failed" />
                        <AgentTraceRow entryCount={12} open status="complete" />
                    </div>
                    <DimensionRule label="aria-expanded reflects the open trace panel" />
                </div>
            </Specimen>

            <Specimen
                detail="240px column: the mono detail truncates through the flexible middle"
                label="Narrow truncation"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ ...column, width: "240px" }}>
                        <AgentTraceRow
                            detail="vitest run src/AgentTracePanel.test.tsx --browser.name=firefox"
                            entryCount={23}
                            kind="terminal"
                            status="running"
                            title="Terminal"
                        />
                    </div>
                    <DimensionRule label="240 px · single-line ellipsis" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
