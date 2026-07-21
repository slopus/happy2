import { type ReactNode } from "react";
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
                alignItems: "center",
                borderRadius: "6px",
                boxSizing: "border-box",
                color: "var(--input-placeholder)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                height: props.height ?? "100%",
                justifyContent: "center",
                margin: "6px",
                outline: "1px dashed var(--surface-selected)",
                outlineOffset: "-6px",
                width: props.width ?? "auto",
            }}
        >
            <span
                style={{
                    color: "var(--text-secondary)",
                    font: "700 11px var(--happy2-font-mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}
            >
                {props.label}
            </span>
            {props.note ? (
                <span style={{ font: "500 10px var(--happy2-font-mono)", letterSpacing: "0.04em" }}>
                    {props.note}
                </span>
            ) : null}
        </div>
    );
}
const titleBarSlot = () => (
    <div style={{ boxSizing: "border-box", height: "38px", display: "flex" }}>
        <Slot height="auto" label="titleBar" note="38px" width="100%" />
    </div>
);
const railSlot = () => <Slot label="rail" note="76px" width="76px" />;
const sidebarSlot = () => <Slot label="sidebar" note="288px" width="288px" />;
function window1024(children: ReactNode) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "1024px" }}>
            <div style={{ height: "704px", width: "1024px" }}>{children}</div>
            <DimensionRule label="1024px × 704px — minimum window contract" />
        </div>
    );
}
export function AppShellPage() {
    return (
        <ComponentPage
            number="C-010"
            summary="Window composition: chrome base, 38px title bar row, rail | main card with no top/left inset, an 8px right/bottom inset, a macOS-matched 8px radius, and a darker sidebar lane separated by an inset hairline."
            title="AppShell"
        >
            <Specimen
                detail="rail 76px · no top/left inset · 8px right/bottom + panel gap · radius 8px · darker sidebar + inset separator share the card with workspace"
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
                        <Slot
                            label="children"
                            note="main workspace · --colors-groupped-background"
                        />
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

            <Specimen
                detail="sidebarCollapsible + panelResizable: an 8px drag separator (role=separator) sits on each inner edge, the sidebar carries a collapse control, and the panel a maximize control"
                label="Resizable sidebar + inspector"
                number="04"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="resizable · 340px" />}
                        panelMaximizable
                        panelResizable
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="resizable · 288px" />}
                        sidebarCollapsible
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="main workspace" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="collapsed sidebar: the sidebar DOM stays mounted but hidden, replaced by a 48px reveal lane whose button restores it"
                label="Sidebar collapsed"
                number="05"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="hidden while collapsed" />}
                        sidebarCollapsible
                        sidebarDefaultCollapsed
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="workspace spans the freed space" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="maximized inspector: the panel overlays the whole content region — including the left sidebar — while the sidebar and workspace stay mounted underneath; the control restores the docked width"
                label="Inspector maximized"
                number="06"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="maximized · overlays content" />}
                        panelDefaultMaximized
                        panelMaximizable
                        panelResizable
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="mounted, overlaid" />}
                        sidebarCollapsible
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="mounted, overlaid" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="expanded trace + input: the panel body (live trace) fills the overlay while a panelFooter keeps the composer pinned at the bottom; the panel body identity is unaffected as the footer mounts"
                label="Expanded trace with composer footer"
                number="07"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={
                            <Slot label="panel body" note="AgentTracePanel · ongoing inference" />
                        }
                        panelDefaultMaximized
                        panelFooter={
                            <div
                                style={{ boxSizing: "border-box", height: "96px", display: "flex" }}
                            >
                                <Slot
                                    height="auto"
                                    label="panelFooter"
                                    note="composer dock"
                                    width="100%"
                                />
                            </div>
                        }
                        panelMaximizable
                        panelResizable
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="mounted, overlaid" />}
                        sidebarCollapsible
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="mounted, overlaid" />
                    </AppShell>,
                )}
            </Specimen>
        </ComponentPage>
    );
}
