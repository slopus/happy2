import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import type { TerminalCellSnapshot, TerminalGridSnapshot } from "happy2-state";
import { Button } from "./Button";

export interface TerminalPanelProps {
    /** The current renderable grid, once output or recovery has arrived. */
    grid?: TerminalGridSnapshot;
    status: "connecting" | "connected" | "disconnected" | "exited" | "error";
    error?: string;
    exitCode?: number | null;
    height: number;
    onClose(): void;
    onHeightChange(height: number): void;
    onInput(data: string): void;
    onReconnect(): void;
    onResize(cols: number, rows: number): void;
}

// One authoritative cell geometry, shared by layout, the cursor overlay, and the
// size derivation. The width is exactly one advance of the bundled JetBrains
// Mono at 14px (0.6em), so a column in CSS `ch` and this pixel value agree.
const CELL_WIDTH = 8.4;
const CELL_HEIGHT = 18;
const ROWS_PADDING_LEFT = 12;
const ROWS_PADDING_TOP = 8;
// The theme default terminal colors, used when an inverse cell has no explicit color.
const DEFAULT_FOREGROUND = "var(--happy2-text)";
const DEFAULT_BACKGROUND = "var(--happy2-bg-code)";

export function TerminalPanel(props: TerminalPanelProps) {
    const onResize = props.onResize;
    const screen = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const drag = useRef<{ startHeight: number; startY: number } | undefined>(undefined);
    // With nothing to show, a dead session collapses to its header line so it
    // does not push the conversation around; once output exists it stays
    // visible through disconnects for context.
    const collapsed =
        !props.grid &&
        (props.status === "error" || props.status === "disconnected" || props.status === "exited");
    useLayoutEffect(() => {
        input.current?.focus();
        const element = screen.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const cols = Math.max(1, Math.floor(entry.contentRect.width / CELL_WIDTH));
            const rows = Math.max(1, Math.floor(entry.contentRect.height / CELL_HEIGHT));
            onResize(cols, rows);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [onResize, collapsed]);
    function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        const sequences: Partial<Record<string, string>> = {
            Enter: "\r",
            Backspace: "\x7f",
            Tab: "\t",
            ArrowUp: "\x1b[A",
            ArrowDown: "\x1b[B",
            ArrowRight: "\x1b[C",
            ArrowLeft: "\x1b[D",
            Escape: "\x1b",
        };
        const sequence = sequences[event.key];
        if (sequence) {
            event.preventDefault();
            props.onInput(sequence);
        } else if (event.ctrlKey && event.key.length === 1) {
            event.preventDefault();
            props.onInput(String.fromCharCode(event.key.toUpperCase().charCodeAt(0) - 64));
        }
    }
    function dragStart(event: React.PointerEvent<HTMLDivElement>) {
        drag.current = { startHeight: props.height, startY: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    const cursor = props.grid?.cursor;
    return (
        <section
            className="happy2-terminal-panel"
            data-collapsed={collapsed ? "" : undefined}
            data-happy2-ui="terminal-panel"
            style={
                collapsed
                    ? undefined
                    : ({
                          height: `${props.height}px`,
                          "--happy2-terminal-cell-width": `${CELL_WIDTH}px`,
                          "--happy2-terminal-cell-height": `${CELL_HEIGHT}px`,
                      } as CSSProperties)
            }
        >
            {collapsed ? null : (
                <div
                    aria-label="Resize terminal"
                    className="happy2-terminal-panel__resize"
                    data-happy2-ui="terminal-resize"
                    onPointerDown={dragStart}
                    onPointerMove={(event) => {
                        const current = drag.current;
                        if (!current) return;
                        props.onHeightChange(current.startHeight + current.startY - event.clientY);
                    }}
                    onPointerUp={() => (drag.current = undefined)}
                    role="separator"
                />
            )}
            <header className="happy2-terminal-panel__header">
                <span className="happy2-terminal-panel__title" data-happy2-ui="terminal-title">
                    {props.grid?.title || "Terminal"}
                </span>
                <span className="happy2-terminal-panel__status">{statusLabel(props)}</span>
                <div className="happy2-terminal-panel__actions">
                    {props.status === "disconnected" || props.status === "error" ? (
                        <Button
                            icon="play"
                            onClick={props.onReconnect}
                            size="small"
                            variant="ghost"
                        >
                            Reconnect
                        </Button>
                    ) : null}
                    <Button
                        aria-label="Close terminal"
                        icon="close"
                        iconOnly
                        onClick={props.onClose}
                        size="small"
                        variant="ghost"
                    />
                </div>
            </header>
            {collapsed ? null : (
                <div
                    className="happy2-terminal-panel__screen"
                    data-happy2-ui="terminal-screen"
                    onPointerDown={() => input.current?.focus()}
                    ref={screen}
                >
                    <div className="happy2-terminal-panel__rows" data-happy2-ui="terminal-rows">
                        {props.grid?.lines.map((row, rowIndex) => (
                            <div className="happy2-terminal-panel__row" key={rowIndex}>
                                {layoutRow(row.cells).map(({ cell, gap }, index) => (
                                    <span
                                        className="happy2-terminal-panel__cell"
                                        data-inverse={cell.inverse ? "" : undefined}
                                        key={`${cell.x}:${index}`}
                                        style={cellStyle(cell, gap)}
                                    >
                                        {cell.text || " "}
                                    </span>
                                ))}
                            </div>
                        ))}
                        {cursor?.visible ? (
                            <div
                                aria-hidden
                                className="happy2-terminal-panel__cursor"
                                data-happy2-ui="terminal-cursor"
                                style={{
                                    // Offset by the rows wrapper padding so cell
                                    // coordinates align with painted glyphs.
                                    left: `calc(${ROWS_PADDING_LEFT}px + ${cursor.x}ch)`,
                                    top: `${ROWS_PADDING_TOP + cursor.y * CELL_HEIGHT}px`,
                                    width: "1ch",
                                    height: `${CELL_HEIGHT}px`,
                                }}
                            />
                        ) : null}
                    </div>
                    <textarea
                        aria-label="Terminal input"
                        className="happy2-terminal-panel__input"
                        onChange={(event) => {
                            if (event.currentTarget.value) props.onInput(event.currentTarget.value);
                            event.currentTarget.value = "";
                        }}
                        onKeyDown={keyDown}
                        ref={input}
                    />
                </div>
            )}
        </section>
    );
}

/**
 * Assigns each sparse cell the column gap from the previous cell's right edge,
 * so cells land on their declared columns and wide cells reserve two columns.
 */
function layoutRow(
    cells: readonly TerminalCellSnapshot[],
): readonly { cell: TerminalCellSnapshot; gap: number }[] {
    let previousEnd = 0;
    return cells.map((cell) => {
        const gap = Math.max(0, cell.x - previousEnd);
        previousEnd = cell.x + cell.width;
        return { cell, gap };
    });
}

function cellStyle(cell: TerminalCellSnapshot, gap: number): CSSProperties {
    // Inverse swaps foreground and background, falling back to theme defaults so
    // the swap is visible even when the cell carries no explicit colors.
    const foreground = cell.inverse
        ? (cell.background ?? DEFAULT_BACKGROUND)
        : (cell.foreground ?? undefined);
    const background = cell.inverse
        ? (cell.foreground ?? DEFAULT_FOREGROUND)
        : (cell.background ?? undefined);
    return {
        marginLeft: gap > 0 ? `${gap}ch` : undefined,
        width: `${cell.width}ch`,
        color: foreground,
        background,
        fontWeight: cell.bold ? 600 : undefined,
        fontStyle: cell.italic ? "italic" : undefined,
        opacity: cell.dim ? 0.6 : undefined,
        textDecorationLine: underlineDecoration(cell),
    };
}

function underlineDecoration(cell: TerminalCellSnapshot): string | undefined {
    const parts = [cell.underline ? "underline" : "", cell.strikethrough ? "line-through" : ""]
        .filter(Boolean)
        .join(" ");
    return parts || undefined;
}

function statusLabel(props: TerminalPanelProps): string {
    if (props.error) return props.error;
    if (props.status === "exited") return `Exited ${props.exitCode ?? ""}`.trim();
    return props.status[0]!.toUpperCase() + props.status.slice(1);
}
