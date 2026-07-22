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
            summary="A quiet Talk to people/agents text switch beneath the composer input. Click it to change destination; hover reveals the Shift+Tab shortcut."
            title="Audience toggle"
        >
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen detail="People mode" label="Talk to people" number="AT-01" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 20" />
                        <AudienceToggle onChange={noop} value="people" />
                    </div>
                </Specimen>
                <Specimen detail="Agents mode" label="Talk to agents" number="AT-02" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 20" />
                        <AudienceToggle onChange={noop} value="agents" />
                    </div>
                </Specimen>
                <Specimen detail="No interaction" label="Disabled" number="AT-03" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 20" />
                        <AudienceToggle disabled onChange={noop} value="agents" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="Click flips people ↔ agents; hover raises the quiet text and shows Shift+Tab"
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
                    detail="Text destination control beneath the input"
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
