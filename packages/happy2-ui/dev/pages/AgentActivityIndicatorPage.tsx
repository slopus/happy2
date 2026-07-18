import { type CSSProperties } from "react";
import { AgentActivityIndicator } from "../../src/AgentActivityIndicator";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const column: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    alignItems: "flex-start",
};
const composerFrame: CSSProperties = {
    background: "var(--happy2-bg-app)",
    border: "1px solid var(--happy2-border)",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px",
    width: "520px",
};
export function AgentActivityIndicatorPage() {
    return (
        <ComponentPage
            number="C-059"
            summary="A live pill for the turn an agent is working on: avatar, a phase word, and a running token count and elapsed time streamed from ephemeral activity hints."
            title="Agent activity indicator"
        >
            <Specimen
                detail="28px pill · avatar xs + name/phase · mono lining-tabular token & time meta"
                label="Phases"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <AgentActivityIndicator
                        elapsedSeconds={7}
                        initials="AD"
                        name="Ada"
                        phase="thinking"
                        tokenCount={128}
                        tone="violet"
                    />
                    <AgentActivityIndicator
                        elapsedSeconds={42}
                        initials="CX"
                        name="Codex"
                        phase="typing"
                        tokenCount={1284}
                        tone="mint"
                    />
                    <DimensionRule label="28 px high · content width" />
                </div>
            </Specimen>

            <Specimen
                detail="Token grouping and m:ss / h:mm:ss elapsed formatting"
                label="Counts and duration"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <AgentActivityIndicator
                        elapsedSeconds={3}
                        initials="CL"
                        name="Claude"
                        phase="typing"
                        tokenCount={42}
                        tone="ember"
                    />
                    <AgentActivityIndicator
                        elapsedSeconds={125}
                        initials="RE"
                        name="Relay"
                        phase="thinking"
                        tokenCount={48300}
                        tone="ocean"
                    />
                    <AgentActivityIndicator
                        elapsedSeconds={3723}
                        initials="OT"
                        name="Otter"
                        phase="typing"
                        tokenCount={1240000}
                        tone="amber"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Docked above a composer, where the app renders it"
                label="In context"
                number="03"
                stage="app"
            >
                <div style={composerFrame}>
                    <AgentActivityIndicator
                        elapsedSeconds={18}
                        initials="CX"
                        name="Codex"
                        phase="typing"
                        tokenCount={2048}
                        tone="mint"
                    />
                    <div
                        style={{
                            background: "var(--happy2-bg-surface)",
                            border: "1px solid var(--happy2-border)",
                            borderRadius: "8px",
                            color: "var(--happy2-text-muted)",
                            font: "500 13px var(--happy2-font-ui)",
                            padding: "10px 12px",
                        }}
                    >
                        Message Codex…
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
