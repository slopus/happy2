import { useState, type CSSProperties } from "react";
import { Button } from "../../src/Button";
import { Icon } from "../../src/Icon";
import { SearchField, TitleBar, WindowDragRegion } from "../../src/TitleBar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
function Crumb() {
    return (
        <span
            style={{
                alignItems: "center",
                color: "var(--text-secondary)",
                display: "inline-flex",
                font: "700 13px var(--happy2-font-ui)",
                gap: "6px",
                whiteSpace: "nowrap",
            }}
        >
            Acme Studio
            <Icon name="chevron-down" size={14} />
        </span>
    );
}
function TrailingActions() {
    return (
        <>
            <Button aria-label="History" icon="clock" iconOnly size="small" variant="ghost" />
            <Button aria-label="Settings" icon="settings" iconOnly size="small" variant="ghost" />
        </>
    );
}
/** Fixture-only stand-in for the native macOS traffic lights. */
function TrafficLights() {
    const dot = (background: string): CSSProperties => ({
        background,
        borderRadius: "50%",
        height: "14px",
        width: "14px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "9px",
                left: "14px",
                position: "absolute",
                top: "12px",
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}
export function TitleBarPage() {
    const [value, setValue] = useState("");
    return (
        <ComponentPage
            number="C-007"
            summary="38px draggable window chrome with a centered 420px global search well — leading crumb and trailing actions ride the 1fr side lanes."
            title="TitleBar + SearchField"
        >
            <Specimen
                detail="38px contract · grid [1fr | 420px max | 1fr] · bottom hairline · bar drags, controls don't"
                label="TitleBar — default"
                number="01"
                stage="chrome"
            >
                <div style={column}>
                    <div style={{ border: "1px solid var(--divider)", width: "960px" }}>
                        <TitleBar
                            leading={<Crumb />}
                            onSearchChange={setValue}
                            searchPlaceholder="Search messages, issues, runs…"
                            searchValue={value}
                            trailing={<TrailingActions />}
                        />
                    </div>
                    <DimensionRule label="960 px window · 38 px high · center 420 px" />
                </div>
            </Specimen>

            <Specimen
                detail="78px native-control reservation · 14px traffic lights at x 14 / y 12 · centered on the 38px panel"
                label="TitleBar — traffic-light inset"
                number="02"
                stage="chrome"
            >
                <div style={column}>
                    <div
                        style={{
                            border: "1px solid var(--divider)",
                            position: "relative",
                            width: "960px",
                        }}
                    >
                        <TitleBar
                            onSearchChange={setValue}
                            searchPlaceholder="Search Acme Studio"
                            searchValue={value}
                            showWindowControls
                            trailing={<TrailingActions />}
                        />
                        <TrafficLights />
                    </div>
                    <DimensionRule label="78 px reserved · 14 px lights · 12 px top/bottom" />
                </div>
            </Specimen>

            <Specimen
                detail="Transparent 38px overlay for full-window states that temporarily replace TitleBar"
                label="WindowDragRegion — authentication"
                number="03"
                stage="chrome"
            >
                <div
                    style={{
                        background: "var(--groupped-background)",
                        height: "120px",
                        position: "relative",
                        width: "720px",
                    }}
                >
                    <WindowDragRegion />
                    <DimensionRule label="720 × 38 px · transparent drag target" />
                </div>
            </Specimen>

            <Specimen
                detail="Narrow windows: side lanes give way first, the field cedes below 420"
                label="TitleBar — 720px window"
                number="04"
                stage="chrome"
            >
                <div style={{ border: "1px solid var(--divider)", width: "720px" }}>
                    <TitleBar
                        leading={<Crumb />}
                        onSearchChange={setValue}
                        searchValue={value}
                        trailing={
                            <Button
                                aria-label="Settings"
                                icon="settings"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        }
                    />
                </div>
            </Specimen>

            <Specimen
                detail="26px well · radius 6 · inset bg + hairline · 14px icon · 12px text · KeyCap hint"
                label="SearchField — fixed 420"
                number="05"
                stage="chrome"
            >
                <div style={column}>
                    <SearchField
                        onChange={setValue}
                        placeholder="Search messages, issues, runs…"
                        value={value}
                        width={420}
                    />
                    <SearchField
                        onChange={() => {}}
                        value="ENG-482 flaky auth refresh"
                        width={420}
                    />
                    <DimensionRule label="420 × 26 px" />
                </div>
            </Specimen>

            <Specimen
                detail="Fills its container by default; custom shortcutHint"
                label="SearchField — fluid + custom hint"
                number="06"
                stage="chrome"
            >
                <div style={{ ...column, width: "280px" }}>
                    <SearchField
                        onChange={setValue}
                        placeholder="Jump to…"
                        shortcutHint="⇧⌘P"
                        value={value}
                    />
                    <DimensionRule label="280 px container → 280 px field" />
                </div>
            </Specimen>

            <Specimen
                detail="Focus swaps the hairline for border-strong plus the accent focus ring — click to try"
                label="SearchField — focus"
                number="07"
                stage="chrome"
            >
                <SearchField
                    onChange={setValue}
                    placeholder="Click to focus"
                    value={value}
                    width={420}
                />
            </Specimen>

            <Specimen
                detail="200px field: long values and placeholders clip inside the well; the KeyCap keeps its 5px inset"
                label="SearchField — long-content truncation"
                number="08"
                stage="chrome"
            >
                <div style={column}>
                    <SearchField
                        onChange={() => {}}
                        value="Umbrella incident retrospective action items for Q3"
                        width={200}
                    />
                    <SearchField
                        onChange={setValue}
                        placeholder="Search every message, issue, agent run, and document…"
                        value={value}
                        width={200}
                    />
                    <DimensionRule label="200 × 26 px" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
