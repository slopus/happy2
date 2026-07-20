import { PortShareControl } from "../../src/PortShareControl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const noop = () => {};

export function PortShareControlPage() {
    return (
        <ComponentPage
            number="C-080"
            summary="Active chat port share control — a link mark plus quick Open and Stop-sharing actions. `bar` fills a panel row with labels and an inline error; `compact` is the header icon-button pair."
            title="PortShareControl"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="panel row · name + host subtitle · Open (secondary) + Stop sharing (ghost)"
                    label="Bar — idle"
                    number="C-080-01"
                    stage="surface"
                >
                    <div style={{ display: "flex", width: "320px", padding: "24px" }}>
                        <DimensionRule label="width 320 · row min-height 28" />
                        <PortShareControl
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            subtitle="documentation-preview-abc123.preview.example"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="opening / disabling busy states disable both actions"
                    label="Bar — busy"
                    number="C-080-02"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            width: "320px",
                            gap: "16px",
                            padding: "24px",
                        }}
                    >
                        <PortShareControl
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            opening
                            subtitle="documentation-preview-abc123.preview.example"
                        />
                        <PortShareControl
                            disabling
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            subtitle="documentation-preview-abc123.preview.example"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="displayable failure — danger mark and inline error line"
                    label="Bar — error"
                    number="C-080-03"
                    stage="surface"
                >
                    <div style={{ display: "flex", width: "320px", padding: "24px" }}>
                        <PortShareControl
                            error="Allow pop-ups for this app to open the shared preview."
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            subtitle="documentation-preview-abc123.preview.example"
                        />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="header icon-button pair — link (open) + close (stop sharing)"
                    label="Compact — idle"
                    number="C-080-04"
                    stage="chrome"
                >
                    <div style={{ display: "flex", padding: "24px" }}>
                        <DimensionRule label="icon buttons 28 · gap 4" />
                        <PortShareControl
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            variant="compact"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="busy + error — buttons disabled, mark turns danger, error rides the title"
                    label="Compact — states"
                    number="C-080-05"
                    stage="chrome"
                >
                    <div style={{ display: "flex", gap: "24px", padding: "24px" }}>
                        <PortShareControl
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            opening
                            variant="compact"
                        />
                        <PortShareControl
                            error="Allow pop-ups for this app to open the shared preview."
                            name="Documentation Preview"
                            onDisable={noop}
                            onOpen={noop}
                            variant="compact"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
