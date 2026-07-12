import { SegmentedControl } from "../../src/SegmentedControl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const RANGE = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

const VIEW = [
    { value: "board", label: "Board", icon: "tasks" as const },
    { value: "list", label: "List", icon: "inbox" as const },
    { value: "timeline", label: "Timeline", icon: "clock" as const },
];

const AVAILABILITY = [
    { value: "auto", label: "Auto" },
    { value: "online", label: "Online" },
    { value: "away", label: "Away" },
    { value: "dnd", label: "Do not disturb" },
];

const SCOPE = [
    { value: "everyone", label: "Everyone" },
    { value: "team", label: "Team" },
];

export function SegmentedControlPage() {
    return (
        <ComponentPage
            number="C-022"
            summary="Inline exclusive choice group (2–5 segments) with a sliding raised pill and one equal column width per segment."
            title="Segmented control"
        >
            <div class="specimen-grid specimen-grid--sizes">
                <Specimen detail="28px high · 12px label" label="Small" number="SC-01" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 28" />
                        <SegmentedControl segments={RANGE} size="small" value="week" />
                    </div>
                </Specimen>
                <Specimen detail="36px high · 13px label" label="Medium" number="SC-02" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 36" />
                        <SegmentedControl segments={RANGE} size="medium" value="week" />
                    </div>
                </Specimen>
                <Specimen detail="44px high · 14px label" label="Large" number="SC-03" stage="app">
                    <div style={{ display: "grid", gap: "8px" }}>
                        <DimensionRule label="height 44" />
                        <SegmentedControl segments={RANGE} size="large" value="week" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="2 · 3 · 4 segments, equal column widths"
                    label="Segment counts"
                    number="SC-04"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "center",
                            "flex-wrap": "wrap",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <SegmentedControl segments={SCOPE} value="team" />
                        <SegmentedControl segments={RANGE} value="week" />
                        <SegmentedControl segments={AVAILABILITY} value="online" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="leading icon 14/16/18 by size · 6px gap"
                    label="Icon + label"
                    number="SC-05"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <SegmentedControl segments={VIEW} size="small" value="board" />
                        <SegmentedControl segments={VIEW} size="medium" value="list" />
                        <SegmentedControl segments={VIEW} size="large" value="timeline" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="selected pill tracks the chosen segment"
                    label="Selection sweep"
                    number="SC-06"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "grid",
                            gap: "12px",
                            padding: "28px",
                            "justify-items": "start",
                        }}
                    >
                        <SegmentedControl segments={AVAILABILITY} value="auto" />
                        <SegmentedControl segments={AVAILABILITY} value="online" />
                        <SegmentedControl segments={AVAILABILITY} value="away" />
                        <SegmentedControl segments={AVAILABILITY} value="dnd" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="fullWidth fills the container · disabled 0.48"
                    label="Full width and disabled"
                    number="SC-07"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "360px", gap: "16px", padding: "28px" }}>
                        <div style={{ display: "grid", gap: "8px" }}>
                            <DimensionRule label="fullWidth — 360px container" />
                            <SegmentedControl fullWidth segments={RANGE} value="week" />
                        </div>
                        <SegmentedControl disabled fullWidth segments={SCOPE} value="everyone" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
