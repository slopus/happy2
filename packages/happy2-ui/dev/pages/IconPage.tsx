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
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                padding: "12px 4px 10px",
                border: "1px solid var(--divider)",
                borderRadius: "8px",
                background: "var(--surface)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "10px",
                    color: "var(--text-secondary)",
                }}
            >
                {SIZES.map((size) => (
                    <Icon key={size} name={props.name} size={size} />
                ))}
            </div>
            <span
                style={{
                    fontFamily: "var(--happy2-font-mono)",
                    fontSize: "9px",
                    lineHeight: "12px",
                    letterSpacing: "0.04em",
                    color: "var(--text-secondary)",
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
                detail="All 47 pinned names at 14 / 16 / 20 px · stroke 1.7 · round caps and joins"
                stage="app"
            >
                <div style={{ width: "820px" }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(6, 1fr)",
                            gap: "8px",
                        }}
                    >
                        {iconNames.map((name) => (
                            <GlyphCell key={name} name={name} />
                        ))}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            marginTop: "12px",
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
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "20px",
                            color: "var(--text)",
                        }}
                    >
                        {([12, 14, 16, 18, 20] as const).map((size) => (
                            <div
                                key={size}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "6px",
                                }}
                            >
                                <Icon name="inbox" size={size} />
                                <span
                                    style={{
                                        fontFamily: "var(--happy2-font-mono)",
                                        fontSize: "9px",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    {size}
                                </span>
                            </div>
                        ))}
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
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ color: "var(--text)" }}>
                        <Icon name="check-circle" size={20} />
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                        <Icon name="check-circle" size={20} />
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background: "var(--header-background)",
                            border: "1px solid var(--divider)",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {OPTICAL_ROW.map((name) => (
                            <Icon key={name} name={name} size={20} />
                        ))}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background: "#f4f2ee",
                            border: "1px solid rgb(0 0 0 / 0.08)",
                            color: "#3c3844",
                        }}
                    >
                        {OPTICAL_ROW.map((name) => (
                            <Icon key={name} name={name} size={20} />
                        ))}
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
