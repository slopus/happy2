import { StatTile } from "../../src/StatTile";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export function StatTilePage() {
    return (
        <ComponentPage
            number="C-031"
            summary="Metric card — muted label, tone icon chip, large tabular value, and a trend delta with an optional hint."
            title="Stat tile"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="240px card · 16px padding · radius 10 · 28px value"
                    label="Anatomy"
                    number="C-031·A"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "6px", width: "240px", padding: "28px" }}>
                        <DimensionRule label="width 240" />
                        <StatTile
                            delta={{ value: "+12%", trend: "up" }}
                            hint="vs last week"
                            icon="spark"
                            label="Active users"
                            tone="accent"
                            value="1,284"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="up success · down danger · flat muted"
                    label="Trends"
                    number="C-031·B"
                    stage="app"
                >
                    <div style={{ display: "flex", gap: "16px", padding: "28px" }}>
                        <div style={{ width: "180px" }}>
                            <StatTile
                                delta={{ value: "+18%", trend: "up" }}
                                label="Messages"
                                value="8,420"
                            />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile
                                delta={{ value: "-12%", trend: "down" }}
                                label="Errors"
                                value="37"
                            />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile
                                delta={{ value: "0%", trend: "flat" }}
                                label="Latency"
                                value="212ms"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="neutral · accent · success · warning · danger"
                    label="Tones"
                    number="C-031·C"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "180px" }}>
                            <StatTile icon="bell" label="Total" tone="neutral" value="1,024" />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile icon="spark" label="Active" tone="accent" value="312" />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile
                                icon="check-circle"
                                label="Resolved"
                                tone="success"
                                value="88%"
                            />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile icon="eye" label="Pending" tone="warning" value="14" />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile icon="shield" label="Blocked" tone="danger" value="3" />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="value only · hint only · long value truncation"
                    label="Content states"
                    number="C-031·D"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "180px" }}>
                            <StatTile label="Uptime" value="99.98%" />
                        </div>
                        <div style={{ width: "180px" }}>
                            <StatTile hint="of 2 TB used" label="Storage" value="68%" />
                        </div>
                        <div style={{ display: "grid", gap: "6px", width: "160px" }}>
                            <DimensionRule label="width 160 — clamp" />
                            <StatTile
                                icon="star"
                                label="Revenue"
                                tone="success"
                                value="$1,284,590.50"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
