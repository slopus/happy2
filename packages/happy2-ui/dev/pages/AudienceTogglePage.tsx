import { useState } from "react";
import { AudienceToggle, type AudienceValue } from "../../src/AudienceToggle";
import { Composer, type ComposerAgent } from "../../src/Composer";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const DEFAULT_AGENT: ComposerAgent = { id: "happy", initials: "HP", name: "Happy", tone: "violet" };
const AGENT_OPTIONS: ComposerAgent[] = [
    { id: "codex", initials: "CX", name: "Codex", tone: "mint" },
    { id: "claude", initials: "CL", name: "Claude", tone: "violet" },
    { id: "triage", initials: "TR", name: "Triage", tone: "amber" },
];
const noop = () => {};

function LiveToggle() {
    const [value, setValue] = useState<AudienceValue>("people");
    return <AudienceToggle onChange={setValue} value={value} />;
}

function LiveComposer() {
    const [value, setValue] = useState("");
    const [audience, setAudience] = useState<AudienceValue>("agents");
    const [selected, setSelected] = useState<string[]>(["codex"]);
    return (
        <Composer
            agentOptions={AGENT_OPTIONS}
            audience={audience}
            defaultAgent={DEFAULT_AGENT}
            hint="Enter to send · Shift+Tab to switch audience"
            onAgentAdd={(id) => setSelected((current) => [...current, id])}
            onAgentRemove={(id) => setSelected((current) => current.filter((item) => item !== id))}
            onAudienceChange={setAudience}
            onSend={noop}
            onValueChange={setValue}
            placeholder="Message #launch-week"
            selectedAgentIds={selected}
            value={value}
        />
    );
}

export function AudienceTogglePage() {
    return (
        <ComponentPage
            number="C-065"
            summary="People/Agents message-destination switch for the composer. Shift+Tab in the composer flips it; Agents mode reveals the default agent and an additional-agent picker."
            title="Audience toggle"
        >
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen detail="People selected" label="People" number="AT-01" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 28" />
                        <AudienceToggle onChange={noop} value="people" />
                    </div>
                </Specimen>
                <Specimen detail="Agents selected" label="Agents" number="AT-02" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 28" />
                        <AudienceToggle onChange={noop} value="agents" />
                    </div>
                </Specimen>
                <Specimen detail="No interaction" label="Disabled" number="AT-03" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 28" />
                        <AudienceToggle disabled onChange={noop} value="agents" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="Click flips People ↔ Agents"
                    label="Live toggle"
                    number="AT-04"
                    stage="surface"
                >
                    <div style={{ display: "flex", padding: "28px" }}>
                        <LiveToggle />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="Agents mode: default agent chip, additional agents, add-agent picker"
                    label="In the composer"
                    number="AT-05"
                    stage="surface"
                >
                    <div style={{ padding: "28px", width: "620px" }}>
                        <LiveComposer />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
