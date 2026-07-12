import { createSignal, type JSX } from "solid-js";
import { Button } from "../../src/Button";
import { Icon } from "../../src/Icon";
import { SearchField, TitleBar } from "../../src/TitleBar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
};

function Crumb() {
    return (
        <span
            style={{
                "align-items": "center",
                color: "var(--rg-text-secondary)",
                display: "inline-flex",
                font: "700 13px var(--rg-font-ui)",
                gap: "6px",
                "white-space": "nowrap",
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
    const dot = (background: string): JSX.CSSProperties => ({
        background,
        "border-radius": "50%",
        height: "12px",
        width: "12px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "8px",
                left: "14px",
                position: "absolute",
                top: "13px",
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}

export function TitleBarPage() {
    const [value, setValue] = createSignal("");

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
                    <div style={{ border: "1px solid var(--rg-border)", width: "960px" }}>
                        <TitleBar
                            leading={<Crumb />}
                            onSearchChange={setValue}
                            searchPlaceholder="Search messages, issues, runs…"
                            searchValue={value()}
                            trailing={<TrailingActions />}
                        />
                    </div>
                    <DimensionRule label="960 px window · 38 px high · center 420 px" />
                </div>
            </Specimen>

            <Specimen
                detail="showWindowControls reserves 78px at the window edge for the macOS traffic lights"
                label="TitleBar — traffic-light inset"
                number="02"
                stage="chrome"
            >
                <div style={column}>
                    <div
                        style={{
                            border: "1px solid var(--rg-border)",
                            position: "relative",
                            width: "960px",
                        }}
                    >
                        <TitleBar
                            onSearchChange={setValue}
                            searchPlaceholder="Search Acme Studio"
                            searchValue={value()}
                            showWindowControls
                            trailing={<TrailingActions />}
                        />
                        <TrafficLights />
                    </div>
                    <DimensionRule label="78 px reserved · lights are native, drawn here for scale" />
                </div>
            </Specimen>

            <Specimen
                detail="Narrow windows: side lanes give way first, the field cedes below 420"
                label="TitleBar — 720px window"
                number="03"
                stage="chrome"
            >
                <div style={{ border: "1px solid var(--rg-border)", width: "720px" }}>
                    <TitleBar
                        leading={<Crumb />}
                        onSearchChange={setValue}
                        searchValue={value()}
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
                number="04"
                stage="chrome"
            >
                <div style={column}>
                    <SearchField
                        onChange={setValue}
                        placeholder="Search messages, issues, runs…"
                        value={value()}
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
                number="05"
                stage="chrome"
            >
                <div style={{ ...column, width: "280px" }}>
                    <SearchField
                        onChange={setValue}
                        placeholder="Jump to…"
                        shortcutHint="⇧⌘P"
                        value={value()}
                    />
                    <DimensionRule label="280 px container → 280 px field" />
                </div>
            </Specimen>

            <Specimen
                detail="Focus swaps the hairline for border-strong plus the accent focus ring — click to try"
                label="SearchField — focus"
                number="06"
                stage="chrome"
            >
                <SearchField
                    onChange={setValue}
                    placeholder="Click to focus"
                    value={value()}
                    width={420}
                />
            </Specimen>

            <Specimen
                detail="200px field: long values and placeholders clip inside the well; the KeyCap keeps its 5px inset"
                label="SearchField — long-content truncation"
                number="07"
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
                        value={value()}
                        width={200}
                    />
                    <DimensionRule label="200 × 26 px" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
