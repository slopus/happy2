import { createGhosttyTerminal, type GhosttyTerminal } from "@slopus/ghostty-wasm/browser";
import type { GhosttyColor, GhosttySnapshot, GhosttyStyle } from "@slopus/ghostty-wasm";
import type { TerminalCellSnapshot, TerminalGridSnapshot } from "happy2-state";

/**
 * One live terminal emulator: it parses raw VT byte streams into the normalized
 * render model product state exposes. This is the app's WebAssembly-backed
 * browser integration, kept out of `happy2-state` so that package stays
 * framework- and runtime-neutral.
 */
export interface TerminalEmulator {
    write(data: Uint8Array): void;
    resize(cols: number, rows: number): void;
    snapshot(): TerminalGridSnapshot;
    dispose(): void;
}

/** Creates a Ghostty WebAssembly emulator sized to the initial grid. */
export async function ghosttyEmulatorCreate(cols: number, rows: number): Promise<TerminalEmulator> {
    const terminal = await createGhosttyTerminal({ cols, rows, colorScheme: "dark" });
    return new GhosttyTerminalEmulator(terminal);
}

class GhosttyTerminalEmulator implements TerminalEmulator {
    constructor(private readonly terminal: GhosttyTerminal) {}

    write(data: Uint8Array): void {
        this.terminal.write(data);
    }

    resize(cols: number, rows: number): void {
        this.terminal.resize(cols, rows);
    }

    snapshot(): TerminalGridSnapshot {
        return ghosttySnapshotToGrid(this.terminal.snapshot());
    }

    dispose(): void {
        this.terminal.dispose();
    }
}

function ghosttySnapshotToGrid(snapshot: GhosttySnapshot): TerminalGridSnapshot {
    const palette = snapshot.palette;
    return {
        cols: snapshot.cols,
        rows: snapshot.visibleRows,
        title: snapshot.title,
        cursor: snapshot.cursor
            ? { x: snapshot.cursor.x, y: snapshot.cursor.y, visible: snapshot.cursor.visible }
            : null,
        lines: snapshot.rows.map((row) => ({
            cells: row.cells.map((cell): TerminalCellSnapshot => {
                const style = cell.style;
                return {
                    x: cell.x,
                    text: cell.text,
                    width: cell.width,
                    bold: style.bold,
                    dim: style.dim,
                    italic: style.italic,
                    underline: style.underline !== "none",
                    inverse: style.inverse,
                    strikethrough: style.strikethrough,
                    foreground: resolveColor(style.foreground, palette),
                    background: resolveColor(style.background, palette),
                };
            }),
        })),
    };
}

/** Resolves a Ghostty style color to a CSS color, or null for the theme default. */
function resolveColor(
    color: GhosttyStyle["foreground"],
    palette: readonly GhosttyColor[],
): string | null {
    if (!color) return null;
    if (color.kind === "rgb") return `rgb(${color.red} ${color.green} ${color.blue})`;
    const resolved = palette[color.index];
    if (resolved && resolved.kind === "rgb")
        return `rgb(${resolved.red} ${resolved.green} ${resolved.blue})`;
    return null;
}
