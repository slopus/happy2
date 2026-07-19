import { expect, it } from "vitest";
import type { TerminalCellSnapshot, TerminalGridSnapshot } from "happy2-state";
import "./theme.css";
import "./styles/terminal-panel.css";
import "./styles/button.css";
import "./styles/icon.css";
import { TerminalPanel } from "./TerminalPanel";
import { createRenderer } from "./testing";

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

function run(startX: number, text: string): TerminalCellSnapshot[] {
    return [...text].map((glyph, index) => cell(startX + index, glyph));
}

function gridOf(lines: TerminalCellSnapshot[][], cursorX = 2): TerminalGridSnapshot {
    return {
        cols: 80,
        rows: 24,
        title: "workspace",
        cursor: { x: cursorX, y: 1, visible: true },
        lines: lines.map((cells) => ({ cells })),
    };
}

const connectedGrid = gridOf([run(0, "happy@rig$ ls"), run(0, "README.md")]);
// Sparse: 'a' at col 0, 'b' at col 5 → four empty columns between them.
const sparseGrid = gridOf([[cell(0, "a"), cell(5, "b")]]);
// Wide: a 2-column glyph at col 0, then a normal glyph at col 3.
const wideGrid = gridOf([[cell(0, "W", { width: 2 }), cell(3, "x")]]);
// Inverse cell with explicit colors that must be swapped, not applied directly.
const inverseGrid = gridOf([
    [cell(0, "I", { inverse: true, foreground: "#111111", background: "#eeeeee" })],
]);

const noop = () => undefined;
const handlers = {
    onClose: noop,
    onHeightChange: noop,
    onInput: noop,
    onReconnect: noop,
    onResize: noop,
};

function panel(testid: string, grid: TerminalGridSnapshot, status: TerminalPanelProps["status"]) {
    return (
        <div
            data-testid={testid}
            style={{ display: "flex", flexDirection: "column", width: "760px" }}
        >
            <TerminalPanel grid={grid} height={240} status={status} {...handlers} />
        </div>
    );
}

type TerminalPanelProps = Parameters<typeof TerminalPanel>[0];

it("holds TerminalPanel geometry, full-bleed screen, and lifecycle controls", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {panel("connected", connectedGrid, "connected")}
                {panel("disconnected", connectedGrid, "disconnected")}
                <div
                    data-testid="exited"
                    style={{ display: "flex", flexDirection: "column", width: "760px" }}
                >
                    <TerminalPanel exitCode={0} height={240} status="exited" {...handlers} />
                </div>
            </div>
        ),
        { width: 800, height: 900, padding: 16 },
    );
    await view.ready();

    /* ---- Connected: a fixed-height flex column with a 36px header ------- */
    const panelEl = view.$('[data-testid="connected"] [data-happy2-ui="terminal-panel"]');
    expect(panelEl.element.tagName).toBe("SECTION");
    expect(panelEl.computedStyles(["display", "flex-direction", "box-sizing"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        "box-sizing": "border-box",
    });
    expect(panelEl.bounds().height).toBe(240);
    expect(panelEl.bounds().width).toBe(760);

    const header = view.container.querySelector(
        '[data-testid="connected"] .happy2-terminal-panel__header',
    ) as HTMLElement;
    expect(header.getBoundingClientRect().height).toBe(36);

    /* ---- Screen scrollport is full-bleed: zero margin/padding, edge to edge */
    const screen = view.$('[data-testid="connected"] [data-happy2-ui="terminal-screen"]');
    expect(screen.computedStyles(["margin", "padding", "overflow", "box-sizing"])).toEqual({
        margin: "0px",
        padding: "0px",
        overflow: "auto",
        "box-sizing": "border-box",
    });
    expect(screen.bounds().width).toBe(panelEl.bounds().width);

    /* ---- Rows wrapper carries the spacing and the monospace type -------- */
    const rows = view.$('[data-testid="connected"] [data-happy2-ui="terminal-rows"]');
    expect(rows.computedStyles(["padding"])).toEqual({ padding: "8px 12px" });
    expect(rows.computedStyles(["font-family"])["font-family"]).toContain("Mono");

    /* ---- Cells actually paint their glyphs ----------------------------- */
    const firstCell = view.$('[data-testid="connected"] .happy2-terminal-panel__cell');
    const ink = await firstCell.visibleMetrics();
    expect(ink.pixelCount, "terminal cell paints no pixels").toBeGreaterThan(0);

    /* ---- The visible cursor overlay sits inside the screen ------------- */
    const cursor = view.$('[data-testid="connected"] [data-happy2-ui="terminal-cursor"]');
    expect(cursor.bounds().height).toBe(18);

    /* ---- Lifecycle drives the controls: connected has close only ------- */
    expect(
        view.container.querySelectorAll(
            '[data-testid="connected"] .happy2-terminal-panel__actions button',
        ),
    ).toHaveLength(1);
    /* ---- Disconnected adds a Reconnect control -------------------------- */
    expect(
        view.container.querySelectorAll(
            '[data-testid="disconnected"] .happy2-terminal-panel__actions button',
        ),
    ).toHaveLength(2);

    /* ---- Exited with no output collapses to just the header line -------- */
    const exited = view.$('[data-testid="exited"] [data-happy2-ui="terminal-panel"]');
    expect(exited.element.hasAttribute("data-collapsed")).toBe(true);
    expect(
        view.container.querySelector('[data-testid="exited"] [data-happy2-ui="terminal-screen"]'),
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="exited"] [data-happy2-ui="terminal-resize"]'),
    ).toBeNull();
    // A collapsed panel is exactly its 36px header plus the panel's 1px top
    // border, not the requested 240px.
    expect(exited.bounds().height).toBe(37);
});

it("lays sparse and wide cells on their declared columns and swaps inverse colors", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {panel("sparse", sparseGrid, "connected")}
                {panel("wide", wideGrid, "connected")}
                {panel("inverse", inverseGrid, "connected")}
            </div>
        ),
        { width: 800, height: 700, padding: 16 },
    );
    await view.ready();

    /* ---- Sparse: a gap after the first cell is preserved, not collapsed - */
    const sparseCells = view.container.querySelectorAll(
        '[data-testid="sparse"] .happy2-terminal-panel__cell',
    );
    const cellA = sparseCells[0]!.getBoundingClientRect();
    const cellB = sparseCells[1]!.getBoundingClientRect();
    // 'a' occupies column 0, 'b' is at column 5 → five columns of advance.
    expect(cellB.x - cellA.x).toBeCloseTo(5 * cellA.width, 1);

    /* ---- Wide: a width-2 cell reserves two columns and shifts the next --- */
    const wideCells = view.container.querySelectorAll(
        '[data-testid="wide"] .happy2-terminal-panel__cell',
    );
    const wideCell = wideCells[0]!.getBoundingClientRect();
    const afterWide = wideCells[1]!.getBoundingClientRect();
    const sparseColumn = cellA.width;
    expect(wideCell.width).toBeCloseTo(2 * sparseColumn, 1);
    // Next glyph sits at column 3 (wide occupies 0-1, one empty column, then 3).
    expect(afterWide.x - wideCell.x).toBeCloseTo(3 * sparseColumn, 1);

    /* ---- Inverse: explicit colors are swapped, not applied straight ----- */
    const inverseCell = view.$('[data-testid="inverse"] .happy2-terminal-panel__cell');
    expect(inverseCell.computedStyles(["color", "background-color"])).toEqual({
        color: "rgb(238, 238, 238)",
        "background-color": "rgb(17, 17, 17)",
    });
});
