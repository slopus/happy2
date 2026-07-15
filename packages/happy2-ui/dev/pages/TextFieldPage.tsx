import { TextField } from "../../src/TextField";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column = {
    display: "grid",
    gap: "16px",
    padding: "28px",
    "justify-items": "start",
} as const;

export function TextFieldPage() {
    return (
        <ComponentPage
            number="C-018"
            summary="Labeled text input / textarea — three heights, hint/error/leading-icon."
            title="Text field"
        >
            <div class="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="28px high · 12px text"
                    label="Small"
                    number="T-01"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", padding: "24px", width: "240px" }}>
                        <DimensionRule label="height 28" />
                        <TextField label="Workspace" placeholder="acme-studio" size="small" />
                    </div>
                </Specimen>
                <Specimen
                    detail="36px high · 13px text"
                    label="Medium"
                    number="T-02"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", padding: "24px", width: "240px" }}>
                        <DimensionRule label="height 36" />
                        <TextField label="Display name" placeholder="Ada Lovelace" size="medium" />
                    </div>
                </Specimen>
                <Specimen
                    detail="44px high · 14px text"
                    label="Large"
                    number="T-03"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", padding: "24px", width: "240px" }}>
                        <DimensionRule label="height 44" />
                        <TextField label="Full name" placeholder="Ada Lovelace" size="large" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="empty placeholder · committed value"
                    label="Content states"
                    number="T-04"
                    stage="surface"
                >
                    <div style={column}>
                        <TextField
                            label="Placeholder"
                            placeholder="ada@example.com"
                            style={{ width: "280px" }}
                        />
                        <TextField
                            label="Filled value"
                            style={{ width: "280px" }}
                            value="ada@example.com"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="required marker · hint · error"
                    label="Guidance"
                    number="T-05"
                    stage="surface"
                >
                    <div style={column}>
                        <TextField
                            hint="Shown on your public profile"
                            label="Display name"
                            required
                            style={{ width: "280px" }}
                            value="Ada Lovelace"
                        />
                        <TextField
                            error="Enter a valid email address"
                            label="Email"
                            style={{ width: "280px" }}
                            value="ada@example"
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="leading icon 14/16/18 · 8px gap"
                    label="Leading icon"
                    number="T-06"
                    stage="surface"
                >
                    <div style={column}>
                        <TextField
                            leadingIcon="search"
                            placeholder="Search runs…"
                            size="small"
                            style={{ width: "280px" }}
                            type="search"
                        />
                        <TextField
                            leadingIcon="at"
                            size="medium"
                            style={{ width: "280px" }}
                            type="email"
                            value="ada@example.com"
                        />
                        <TextField
                            leadingIcon="link"
                            size="large"
                            style={{ width: "280px" }}
                            value="happy2.dev/ada"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="disabled · password"
                    label="Locked and secret"
                    number="T-07"
                    stage="surface"
                >
                    <div style={column}>
                        <TextField
                            disabled
                            label="Workspace ID"
                            style={{ width: "280px" }}
                            value="ws_9f31c2"
                        />
                        <TextField
                            label="Password"
                            style={{ width: "280px" }}
                            type="password"
                            value="hunter2hunter2"
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="multiline textarea · 3 rows · 20px line"
                    label="Textarea"
                    number="T-08"
                    stage="surface"
                >
                    <div style={{ padding: "28px", width: "360px" }}>
                        <TextField
                            fullWidth
                            hint="Markdown supported"
                            label="Channel topic"
                            multiline
                            rows={3}
                            value={"Ship the Relay redesign.\nOwners: @ada, @grace."}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="fullWidth vs 240px default"
                    label="Width"
                    number="T-09"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "16px", padding: "28px", width: "360px" }}>
                        <div style={{ display: "grid", gap: "6px" }}>
                            <DimensionRule label="fullWidth — 304px container" />
                            <TextField fullWidth label="Subject" placeholder="What changed?" />
                        </div>
                        <TextField label="Default (240px)" placeholder="acme-studio" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
