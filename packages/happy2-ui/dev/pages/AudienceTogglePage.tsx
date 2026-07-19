import { useState } from "react";
import { AudienceToggle, type AudienceValue } from "../../src/AudienceToggle";
import { Composer } from "../../src/Composer";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const noop = () => {};

function LiveToggle() {
    const [value, setValue] = useState<AudienceValue>("people");
    return <AudienceToggle onChange={setValue} value={value} />;
}

function LiveComposer() {
    const [value, setValue] = useState("");
    const [audience, setAudience] = useState<AudienceValue>("agents");
    return (
        <Composer
            audience={audience}
            hint="Enter to send · Shift+Tab to switch audience"
            onAudienceChange={setAudience}
            onSend={noop}
            onValueChange={setValue}
            placeholder={audience === "agents" ? "Message Happy" : "Message #launch-week"}
            value={value}
        />
    );
}

export function AudienceTogglePage() {
    return (
        <ComponentPage
            number="C-065"
            summary="People/Agents message-destination switch for the composer. Shift+Tab in the composer flips it; Agents mode tints the whole composer frame with the accent and names the agent in the placeholder."
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
