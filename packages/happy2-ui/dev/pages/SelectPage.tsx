import { Select } from "../../src/Select";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const roles = [
    { value: "owner", label: "Owner" },
    { value: "admin", label: "Admin" },
    { value: "member", label: "Member" },
    { value: "guest", label: "Guest", disabled: true },
];

const retention = [
    { value: "inherit", label: "Inherit from workspace" },
    { value: "forever", label: "Keep forever" },
    { value: "30d", label: "Delete after 30 days" },
    { value: "7d", label: "Delete after 7 days" },
];

export function SelectPage() {
    return (
        <ComponentPage
            number="C-019"
            summary="Styled native single-select — three contract heights, placeholder / selected / error / disabled states, and truncating long options with a tuned chevron."
            title="Select"
        >
            <div class="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="28px high · 12px value"
                    label="Small"
                    number="S-01"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", width: "224px" }}>
                        <DimensionRule label="height 28" />
                        <Select options={roles} size="small" value="admin" width={224} />
                    </div>
                </Specimen>
                <Specimen
                    detail="36px high · 13px value"
                    label="Medium"
                    number="S-02"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", width: "224px" }}>
                        <DimensionRule label="height 36" />
                        <Select options={roles} size="medium" value="admin" width={224} />
                    </div>
                </Specimen>
                <Specimen
                    detail="44px high · 14px value"
                    label="Large"
                    number="S-03"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", width: "224px" }}>
                        <DimensionRule label="height 44" />
                        <Select options={roles} size="large" value="admin" width={224} />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="label · placeholder · selected · hint"
                    label="Labeled states"
                    number="S-04"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "flex-start",
                            gap: "28px",
                            padding: "28px",
                        }}
                    >
                        <Select
                            hint="Controls who can manage the channel"
                            label="Placeholder"
                            options={roles}
                            placeholder="Select a role…"
                            width={224}
                        />
                        <Select
                            hint="Applied to every new message"
                            label="Selected"
                            options={roles}
                            value="member"
                            width={224}
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="error message · disabled"
                    label="Validation and disabled"
                    number="S-05"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "flex-start",
                            gap: "28px",
                            padding: "28px",
                        }}
                    >
                        <Select
                            error="Pick a role to continue"
                            label="Error"
                            options={roles}
                            placeholder="Select a role…"
                            width={224}
                        />
                        <Select
                            disabled
                            label="Disabled"
                            options={roles}
                            value="owner"
                            width={224}
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="fullWidth · long option truncates with an ellipsis"
                    label="Full width and truncation"
                    number="S-06"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "18px", width: "360px", padding: "28px" }}>
                        <div style={{ display: "grid", gap: "6px" }}>
                            <DimensionRule label="fullWidth — 360px container" />
                            <Select
                                fullWidth
                                label="Message retention"
                                options={retention}
                                value="inherit"
                            />
                        </div>
                        <Select options={retention} value="30d" width={168} />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
