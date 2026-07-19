import type { TerminalCellSnapshot, TerminalGridSnapshot } from "happy2-state";
import { TerminalPanel } from "../../src/TerminalPanel";
import { ComponentPage, Specimen } from "../kit";

function cell(
    x: number,
    text: string,
    overrides: Partial<TerminalCellSnapshot> = {},
): TerminalCellSnapshot {
    return {
        x,
        text,
        width: 1,
        bold: false,
        dim: false,
        italic: false,
        underline: false,
        inverse: false,
        strikethrough: false,
        foreground: null,
        background: null,
        ...overrides,
    };
}

/** Real grid cells are one glyph each; build a run as consecutive single cells. */
function run(
    startX: number,
    text: string,
    overrides: Partial<TerminalCellSnapshot> = {},
): TerminalCellSnapshot[] {
    return [...text].map((glyph, index) => cell(startX + index, glyph, overrides));
}

const grid: TerminalGridSnapshot = {
    cols: 80,
    rows: 24,
    title: "workspace",
    cursor: { x: 2, y: 3, visible: true },
    lines: [
        { cells: run(0, "happy@rig:/workspace$ pnpm test") },
        {
            cells: [
                ...run(0, "Tests", { bold: true }),
                ...run(7, "127 passed", { foreground: "#34d399" }),
            ],
        },
        { cells: run(0, "warning: 2 skipped", { foreground: "#fbbf24", italic: true }) },
        {
            cells: [cell(0, "選", { width: 2 }), ...run(3, "wide", { inverse: true })],
        },
        { cells: run(0, "$ ") },
    ],
};

function noop(): void {
    // Blueprint fixtures are inert; handlers do nothing.
}

const handlers = {
    onClose: noop,
    onHeightChange: noop,
    onInput: noop,
    onReconnect: noop,
    onResize: noop,
};

export function TerminalPanelPage() {
    return (
        <ComponentPage
            number="C-078"
            summary="Resizable interactive terminal dock rendering the Rig binary-protocol grid."
            title="Terminal panel"
        >
            <Specimen
                detail="connected · 80 × 24 · styled Rig grid cells with cursor"
                label="Connected"
                number="01"
                stage="app"
            >
                <div style={frame}>
                    <TerminalPanel grid={grid} height={280} status="connected" {...handlers} />
                </div>
            </Specimen>
            <Specimen
                detail="disconnected · output retained · reconnect offered"
                label="Reconnecting"
                number="02"
                stage="app"
            >
                <div style={frame}>
                    <TerminalPanel grid={grid} height={280} status="disconnected" {...handlers} />
                </div>
            </Specimen>
            <Specimen
                detail="exited · frameless session collapses to its header line"
                label="Exited (collapsed)"
                number="03"
                stage="app"
            >
                <div style={{ ...frame, height: "120px" }}>
                    <TerminalPanel exitCode={0} height={280} status="exited" {...handlers} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}

const frame = {
    display: "flex",
    flexDirection: "column" as const,
    height: "360px",
    width: "760px",
};
