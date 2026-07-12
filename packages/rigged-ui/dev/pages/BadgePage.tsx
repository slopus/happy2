import { For } from "solid-js";
import { Badge, CountBadge, KeyCap, ReactionChip, type BadgeVariant } from "../../src/Badge";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const row: Record<string, string> = {
    "align-items": "center",
    display: "flex",
    gap: "10px",
    "flex-wrap": "wrap",
};

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
};

const variants: Array<{ label: string; variant: BadgeVariant }> = [
    { label: "QUEUED", variant: "neutral" },
    { label: "AGENT", variant: "accent" },
    { label: "NEEDS REVIEW", variant: "success" },
    { label: "IN PROGRESS", variant: "warning" },
    { label: "FAILED", variant: "danger" },
    { label: "SYNCED", variant: "info" },
    { label: "CONFIG", variant: "outline" },
];

export function BadgePage() {
    return (
        <ComponentPage
            number="C-005"
            summary="Status pills, unread counts, reaction chips, and shortcut key caps — the small mono-labelled signals that annotate everything else."
            title="Badge family"
        >
            <Specimen
                detail="18px pill · radius 4 · mono 10/700 uppercase · letter-spacing 0.06em"
                label="Badge — seven variants"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <div style={row}>
                        <For each={variants}>
                            {(entry) => <Badge label={entry.label} variant={entry.variant} />}
                        </For>
                    </div>
                    <DimensionRule label="18 px high · 6 px x-pad" />
                </div>
            </Specimen>

            <Specimen
                detail="Optional 12px leading icon, 4px gap"
                label="Badge — with icon"
                number="02"
                stage="surface"
            >
                <div style={row}>
                    <Badge icon="spark" label="AGENT" variant="accent" />
                    <Badge icon="check-circle" label="COMPLETED" variant="success" />
                    <Badge icon="clock" label="QUEUED" variant="neutral" />
                    <Badge icon="shield" label="APPROVAL" variant="warning" />
                    <Badge icon="branch" label="fix/auth-flake" variant="outline" />
                </div>
            </Specimen>

            <Specimen
                detail="18px round pill · min-width 18 · mono 11/700 lining tabular numerals · accent and neutral tones"
                label="CountBadge"
                number="03"
                stage="chrome"
            >
                <div style={column}>
                    <div style={row}>
                        <For each={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}>
                            {(count) => <CountBadge count={count} />}
                        </For>
                        <CountBadge count={12} />
                        <CountBadge count={128} />
                        <CountBadge count={1234} />
                        <CountBadge count={4} tone="neutral" />
                        <CountBadge count={12} tone="neutral" />
                    </div>
                    <DimensionRule label="18 px min · grows with digits" />
                </div>
            </Specimen>

            <Specimen
                detail="24px pill · fixed 18px system-emoji slot + mono 11/700 lining/tabular count · active = accent"
                label="ReactionChip"
                number="04"
                stage="app"
            >
                <div style={column}>
                    <div style={row}>
                        <ReactionChip count={2} emoji="👍" />
                        <ReactionChip count={3} emoji="🎉" />
                        <ReactionChip count={2} emoji="🚀" />
                        <ReactionChip active count={5} emoji="✅" />
                        <ReactionChip count={12} emoji="👩‍💻" />
                        <ReactionChip count={128} emoji="🇺🇸" />
                    </div>
                    <DimensionRule label="24 px high · 8 px x-pad" />
                </div>
            </Specimen>

            <Specimen
                detail="18px cap · normalized 9px modifier SVGs + mono 10.8/500 text cells · bearing-aware adjacency · 4px x-padding"
                label="KeyCap"
                number="05"
                stage="chrome"
            >
                <div style={row}>
                    <KeyCap keys="⌘K" />
                    <KeyCap keys="⇧⌘P" />
                    <KeyCap keys="⌥⌘K" />
                    <KeyCap keys="⌃K" />
                    <KeyCap keys="ESC" />
                    <KeyCap keys="ENTER" />
                </div>
            </Specimen>

            <Specimen
                detail="Badges annotating a card header, as composed in the app"
                label="In context"
                number="06"
                stage="surface"
            >
                <div style={{ ...row, gap: "8px" }}>
                    <span
                        style={{
                            color: "var(--rg-text)",
                            font: "700 13px var(--rg-font-ui)",
                        }}
                    >
                        Codex finished a run
                    </span>
                    <Badge label="NEEDS REVIEW" variant="success" />
                    <Badge label="fix/auth-flake" variant="outline" />
                    <CountBadge count={3} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
