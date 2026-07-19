import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { TerminalFrame } from "happy2-state";
import { Button } from "./Button";

export interface TerminalPanelProps {
    frame?: TerminalFrame;
    status: "connecting" | "connected" | "disconnected" | "exited" | "error";
    error?: string;
    height: number;
    onClose(): void;
    onHeightChange(height: number): void;
    onInput(data: string): void;
    onReconnect(): void;
    onResize(cols: number, rows: number): void;
}

export function TerminalPanel(props: TerminalPanelProps) {
    const onResize = props.onResize;
    const screen = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const drag = useRef<{ startHeight: number; startY: number } | undefined>(undefined);
    // With no frame to show, a dead session is a one-line notice: the header
    // (status + Reconnect + close) is the whole panel, with no empty screen
    // area pushing the conversation around. Once output exists it stays
    // visible through disconnects for context.
    const collapsed =
        !props.frame &&
        (props.status === "error" || props.status === "disconnected" || props.status === "exited");
    useLayoutEffect(() => {
        input.current?.focus();
        const element = screen.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const cols = Math.max(1, Math.floor(entry.contentRect.width / 8.4));
            const rows = Math.max(1, Math.floor(entry.contentRect.height / 18));
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
    return (
        <section
            className="happy2-terminal-panel"
            data-collapsed={collapsed ? "" : undefined}
            data-happy2-ui="terminal-panel"
            style={collapsed ? undefined : { height: `${props.height}px` }}
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
                <span className="happy2-terminal-panel__title">Terminal</span>
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
                    <div className="happy2-terminal-panel__rows">
                        {props.frame?.rows.map((row, rowIndex) => (
                            <div className="happy2-terminal-panel__row" key={rowIndex}>
                                {row.cells.map((cell, index) => (
                                    <span
                                        className="happy2-terminal-panel__cell"
                                        key={`${cell.x}:${index}`}
                                        style={{
                                            marginLeft: index === 0 ? `${cell.x}ch` : undefined,
                                        }}
                                    >
                                        {cell.text}
                                    </span>
                                ))}
                            </div>
                        ))}
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

function statusLabel(props: TerminalPanelProps): string {
    if (props.error) return props.error;
    if (props.status === "exited") return `Exited ${props.frame?.exitCode ?? ""}`.trim();
    return props.status[0]!.toUpperCase() + props.status.slice(1);
}
