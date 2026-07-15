import { Switch } from "../../src/Switch";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export function SwitchPage() {
    return (
        <ComponentPage
            number="C-020"
            summary="Relay toggle — two sizes, on/off with accent vs inset track, optional label and secondary description, disabled state."
            title="Switch"
        >
            <div class="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="track 36×20 · thumb 16 · travel 16"
                    label="Medium"
                    number="S-01"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "center",
                            gap: "14px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "120px" }}>
                            <DimensionRule label="track 36 × 20" />
                        </div>
                        <div style={{ display: "flex", "align-items": "center", gap: "24px" }}>
                            <Switch aria-label="Off" checked={false} size="medium" />
                            <Switch aria-label="On" checked size="medium" />
                        </div>
                    </div>
                </Specimen>
                <Specimen
                    detail="track 28×16 · thumb 12 · travel 12"
                    label="Small"
                    number="S-02"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "center",
                            gap: "14px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "120px" }}>
                            <DimensionRule label="track 28 × 16" />
                        </div>
                        <div style={{ display: "flex", "align-items": "center", gap: "24px" }}>
                            <Switch aria-label="Off" checked={false} size="small" />
                            <Switch aria-label="On" checked size="small" />
                        </div>
                    </div>
                </Specimen>
                <Specimen
                    detail="opacity 0.48 · not-allowed"
                    label="Disabled"
                    number="S-03"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "center",
                            gap: "18px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ display: "flex", "align-items": "center", gap: "24px" }}>
                            <Switch aria-label="Off disabled" checked={false} disabled />
                            <Switch aria-label="On disabled" checked disabled />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="label 13/20 · track center on label line · 10px gap"
                    label="With label"
                    number="S-04"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <Switch checked label="Enable notifications" />
                        <Switch checked={false} label="Play join sound" />
                        <Switch checked disabled label="Read receipts (locked)" />
                    </div>
                </Specimen>
                <Specimen
                    detail="description 12/16 muted below the label"
                    label="Label and description"
                    number="S-05"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            gap: "18px",
                            padding: "28px",
                        }}
                    >
                        <Switch
                            checked
                            description="Push alerts to this device"
                            label="Notifications"
                        />
                        <Switch
                            checked={false}
                            description="Show a denser message layout"
                            label="Compact mode"
                            size="small"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
