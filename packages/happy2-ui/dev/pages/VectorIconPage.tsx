import {
    Ionicon,
    type IoniconName,
    Octicon,
    type OcticonName,
} from "../../src/vectorIcons/VectorIcon";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const SIZES = [14, 16, 20, 24] as const;

/* Ionicons Happy leans on across the app chrome, chat, and agent surfaces. */
const IONICON_SAMPLE: IoniconName[] = [
    "home",
    "home-outline",
    "chatbubble-outline",
    "chatbubbles-outline",
    "search",
    "search-outline",
    "settings-outline",
    "person-circle-outline",
    "people-outline",
    "add",
    "add-circle-outline",
    "send",
    "checkmark",
    "checkmark-circle",
    "chevron-forward",
    "chevron-down",
    "close",
    "ellipsis-horizontal",
    "notifications-outline",
    "star",
    "star-outline",
    "trash-outline",
    "arrow-forward",
    "arrow-back",
    "shield-checkmark-outline",
    "eye-outline",
    "link-outline",
    "attach-outline",
    "mic-outline",
    "play",
    "pause",
    "sunny-outline",
    "moon-outline",
    "sync-outline",
    "warning-outline",
    "information-circle-outline",
];

/* The Octicons Happy uses for code, diff, and repository affordances. */
const OCTICON_SAMPLE: OcticonName[] = [
    "file-diff",
    "terminal",
    "search",
    "eye",
    "rocket",
    "git-branch",
    "light-bulb",
    "file-directory",
    "file",
    "diff-removed",
    "diff-added",
    "chevron-right",
    "check",
    "arrow-down",
    "repo",
    "code",
];

function IoniconCell(props: { name: IoniconName }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                padding: "12px 4px 10px",
                border: "1px solid var(--colors-divider)",
                borderRadius: "8px",
                background: "var(--colors-surface)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "10px",
                    color: "var(--colors-text-secondary)",
                }}
            >
                {SIZES.map((size) => (
                    <Ionicon key={size} name={props.name} size={size} />
                ))}
            </div>
            <span
                style={{
                    fontFamily: "var(--happy2-font-mono)",
                    fontSize: "9px",
                    lineHeight: "12px",
                    letterSpacing: "0.04em",
                    color: "var(--colors-text-secondary)",
                    textAlign: "center",
                }}
            >
                {props.name}
            </span>
        </div>
    );
}

function OcticonCell(props: { name: OcticonName }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                padding: "12px 4px 10px",
                border: "1px solid var(--colors-divider)",
                borderRadius: "8px",
                background: "var(--colors-surface)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "10px",
                    color: "var(--colors-text-secondary)",
                }}
            >
                {SIZES.map((size) => (
                    <Octicon key={size} name={props.name} size={size} />
                ))}
            </div>
            <span
                style={{
                    fontFamily: "var(--happy2-font-mono)",
                    fontSize: "9px",
                    lineHeight: "12px",
                    letterSpacing: "0.04em",
                    color: "var(--colors-text-secondary)",
                    textAlign: "center",
                }}
            >
                {props.name}
            </span>
        </div>
    );
}

export function VectorIconPage() {
    return (
        <ComponentPage
            number="C-002b"
            title="Vector icons"
            summary="Font-based Ionicons and Octicons ported verbatim from Happy's @expo/vector-icons usage. Addressed by the upstream glyph names so a name renders the same glyph Happy renders."
        >
            <Specimen
                number="01"
                label="Ionicons"
                detail="A representative slice of the 1357-glyph Ionicons set at 14 / 16 / 20 / 24 px · currentColor"
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
                        {IONICON_SAMPLE.map((name) => (
                            <IoniconCell key={name} name={name} />
                        ))}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            marginTop: "12px",
                        }}
                    >
                        <DimensionRule label="sizes 14 / 16 / 20 / 24 px" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="02"
                label="Octicons"
                detail="The Octicons Happy uses for code, diff, and repository affordances · 331-glyph set"
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
                        {OCTICON_SAMPLE.map((name) => (
                            <OcticonCell key={name} name={name} />
                        ))}
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="03"
                label="Size ramp"
                detail="12 / 16 / 20 / 24 / 32 px — the glyph fills its square font box, color follows currentColor"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "20px",
                        color: "var(--colors-text)",
                    }}
                >
                    {([12, 16, 20, 24, 32] as const).map((size) => (
                        <div
                            key={size}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            <Ionicon name="chatbubbles-outline" size={size} />
                            <span
                                style={{
                                    fontFamily: "var(--happy2-font-mono)",
                                    fontSize: "9px",
                                    color: "var(--colors-input-placeholder)",
                                }}
                            >
                                {size}
                            </span>
                        </div>
                    ))}
                    <DimensionRule label="default 16" />
                </div>
            </Specimen>

            <Specimen
                number="04"
                label="Color"
                detail="currentColor by default · explicit color prop for semantic tints"
                stage="surface"
            >
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ color: "var(--colors-text)" }}>
                        <Ionicon name="checkmark-circle" size={24} />
                    </span>
                    <span style={{ color: "var(--colors-text-secondary)" }}>
                        <Ionicon name="checkmark-circle" size={24} />
                    </span>
                    <Ionicon name="checkmark-circle" size={24} color="#8b7cf7" />
                    <Ionicon name="checkmark-circle" size={24} color="#34d399" />
                    <Ionicon name="checkmark-circle" size={24} color="#fbbf24" />
                    <Ionicon name="checkmark-circle" size={24} color="#f87171" />
                </div>
            </Specimen>

            <Specimen
                number="05"
                label="Dark vs light optical row"
                detail="Same glyphs over chrome-dark and paper-light — the font baseline and box must hold on both"
                stage="chrome"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background: "var(--colors-header-background)",
                            border: "1px solid var(--colors-divider)",
                            color: "var(--colors-text-secondary)",
                        }}
                    >
                        {IONICON_SAMPLE.slice(0, 12).map((name) => (
                            <Ionicon key={name} name={name} size={20} />
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
                        {OCTICON_SAMPLE.slice(0, 12).map((name) => (
                            <Octicon key={name} name={name} size={20} />
                        ))}
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
