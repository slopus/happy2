import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { AppShell } from "../../src/AppShell";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/*
 * Slot placeholders: the shell composes TitleBar, Rail, Sidebar, and content
 * built elsewhere, so the blueprint marks each region with a dashed slot and
 * its contract dimension instead of duplicating those components.
 */
function Slot(props: { height?: string; label: string; note?: string; width?: string }) {
    return (
        <div
            style={{
                "align-items": "center",
                "border-radius": "6px",
                "box-sizing": "border-box",
                color: "var(--rg-text-faint)",
                display: "flex",
                "flex-direction": "column",
                gap: "8px",
                height: props.height ?? "100%",
                "justify-content": "center",
                margin: "6px",
                outline: "1px dashed var(--rg-border-strong)",
                "outline-offset": "-6px",
                width: props.width ?? "auto",
            }}
        >
            <span
                style={{
                    color: "var(--rg-text-muted)",
                    font: "700 11px var(--rg-font-mono)",
                    "letter-spacing": "0.08em",
                    "text-transform": "uppercase",
                }}
            >
                {props.label}
            </span>
            <Show when={props.note}>
                <span style={{ font: "500 10px var(--rg-font-mono)", "letter-spacing": "0.04em" }}>
                    {props.note}
                </span>
            </Show>
        </div>
    );
}

const titleBarSlot = () => (
    <div style={{ "box-sizing": "border-box", height: "38px", display: "flex" }}>
        <Slot height="auto" label="titleBar" note="38px" width="100%" />
    </div>
);
const railSlot = () => <Slot label="rail" note="76px" width="76px" />;
const sidebarSlot = () => <Slot label="sidebar" note="288px" width="288px" />;

function window1024(children: JSX.Element) {
    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px", width: "1024px" }}>
            <div style={{ height: "704px", width: "1024px" }}>{children}</div>
            <DimensionRule label="1024px × 704px — minimum window contract" />
        </div>
    );
}

export function AppShellPage() {
    return (
        <ComponentPage
            number="C-010"
            summary="Window composition: chrome base, 38px title bar row, rail | main card with no top/left inset, an 8px right/bottom inset, and a macOS-matched 8px radius."
            title="AppShell"
        >
            <Specimen
                detail="rail 76px · no top/left inset · 8px right/bottom + panel gap · radius 8px · sidebar + workspace share the card"
                label="Full composition with panel"
                number="01"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="340px · agent desk" />}
                        rail={railSlot()}
                        sidebar={sidebarSlot()}
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="main workspace · --rg-bg-app" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="no panel — sidebar and workspace share one card, flush to rail/title with 8px right/bottom clearance"
                label="Rail + sidebar, no panel"
                number="02"
                stage="chrome"
            >
                {window1024(
                    <AppShell rail={railSlot()} sidebar={sidebarSlot()} titleBar={titleBarSlot()}>
                        <Slot label="children" note="workspace beside the 288px sidebar" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="sidebar omitted · panelWidth 300 — the panel keeps its explicit width, the main card takes the rest"
                label="Rail only, custom panel width"
                number="03"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="panelWidth 300" />}
                        panelWidth={300}
                        rail={railSlot()}
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="main workspace" />
                    </AppShell>,
                )}
            </Specimen>
        </ComponentPage>
    );
}
