import { For } from "solid-js";
import { Icon, iconNames, type IconName } from "../../src/Icon";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const SIZES = [14, 16, 20] as const;

const OPTICAL_ROW: IconName[] = [
    "home",
    "inbox",
    "chat",
    "agents",
    "search",
    "spark",
    "branch",
    "check-circle",
    "bell",
    "star",
    "send",
    "terminal",
];

function GlyphCell(props: { name: IconName }) {
    return (
        <div
            style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: "8px",
                padding: "12px 4px 10px",
                border: "1px solid var(--rg-border)",
                "border-radius": "8px",
                background: "var(--rg-bg-surface)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    "align-items": "flex-end",
                    gap: "10px",
                    color: "var(--rg-text-secondary)",
                }}
            >
                <For each={SIZES}>{(size) => <Icon name={props.name} size={size} />}</For>
            </div>
            <span
                style={{
                    "font-family": "var(--rg-font-mono)",
                    "font-size": "9px",
                    "line-height": "12px",
                    "letter-spacing": "0.04em",
                    color: "var(--rg-text-muted)",
                }}
            >
                {props.name}
            </span>
        </div>
    );
}

export function IconPage() {
    return (
        <ComponentPage
            number="C-002"
            title="Icon"
            summary="Hand-drawn 20-unit-grid stroke glyphs — 1.7 stroke mass, round caps, optically centered. The visual backbone of every Relay component."
        >
            <Specimen
                number="01"
                label="Glyph set"
                detail="All 42 pinned names at 14 / 16 / 20 px · stroke 1.7 · round caps and joins"
                stage="app"
            >
                <div style={{ width: "820px" }}>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(6, 1fr)",
                            gap: "8px",
                        }}
                    >
                        <For each={iconNames}>{(name) => <GlyphCell name={name} />}</For>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            "margin-top": "12px",
                        }}
                    >
                        <DimensionRule label="cell sizes 14 / 16 / 20 px" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="02"
                label="Size ramp"
                detail="12 / 14 / 16 (default) / 18 / 20 px — stroke scales with the box, mass stays even"
                stage="surface"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <div
                        style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "20px",
                            color: "var(--rg-text)",
                        }}
                    >
                        <For each={[12, 14, 16, 18, 20] as const}>
                            {(size) => (
                                <div
                                    style={{
                                        display: "flex",
                                        "flex-direction": "column",
                                        "align-items": "center",
                                        gap: "6px",
                                    }}
                                >
                                    <Icon name="inbox" size={size} />
                                    <span
                                        style={{
                                            "font-family": "var(--rg-font-mono)",
                                            "font-size": "9px",
                                            color: "var(--rg-text-faint)",
                                        }}
                                    >
                                        {size}
                                    </span>
                                </div>
                            )}
                        </For>
                        <DimensionRule label="default 16" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="03"
                label="Color"
                detail="currentColor by default · explicit color prop for semantic tints"
                stage="surface"
            >
                <div style={{ display: "flex", "align-items": "center", gap: "16px" }}>
                    <span style={{ color: "var(--rg-text)" }}>
                        <Icon name="check-circle" size={20} />
                    </span>
                    <span style={{ color: "var(--rg-text-secondary)" }}>
                        <Icon name="check-circle" size={20} />
                    </span>
                    <span style={{ color: "var(--rg-text-muted)" }}>
                        <Icon name="check-circle" size={20} />
                    </span>
                    <Icon name="check-circle" size={20} color="#8b7cf7" />
                    <Icon name="check-circle" size={20} color="#34d399" />
                    <Icon name="check-circle" size={20} color="#fbbf24" />
                    <Icon name="check-circle" size={20} color="#f87171" />
                </div>
            </Specimen>

            <Specimen
                number="04"
                label="Dark vs light optical row"
                detail="Same glyphs over chrome-dark and paper-light — centering and stroke mass must hold on both"
                stage="chrome"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            padding: "12px 16px",
                            "border-radius": "8px",
                            background: "var(--rg-bg-chrome)",
                            border: "1px solid var(--rg-border)",
                            color: "var(--rg-text-secondary)",
                        }}
                    >
                        <For each={OPTICAL_ROW}>{(name) => <Icon name={name} size={20} />}</For>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            padding: "12px 16px",
                            "border-radius": "8px",
                            background: "#f4f2ee",
                            border: "1px solid rgb(0 0 0 / 0.08)",
                            color: "#3c3844",
                        }}
                    >
                        <For each={OPTICAL_ROW}>{(name) => <Icon name={name} size={20} />}</For>
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
