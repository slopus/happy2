import { createStore, type StoreApi } from "zustand/vanilla";
import type { StateRuntime } from "../runtime/runtimeState.js";
import type { TerminalConnection } from "../../transport.js";
import { UserError } from "../../types.js";

/**
 * Normalized, immutable terminal render model. Both live VT emulation and
 * semantic grid recovery converge on this one shape so a view renders a
 * terminal purely from props, with colors already resolved to CSS strings and
 * no palette, style-table, or emulator knowledge left for the UI to interpret.
 */
export interface TerminalCellSnapshot {
    /** Column of the cell's left edge in the visible grid. */
    readonly x: number;
    /** The glyph(s) painted in this cell; empty string renders as blank. */
    readonly text: string;
    /** 1 for a normal cell, 2 for the left half of a wide (CJK/emoji) glyph. */
    readonly width: 1 | 2;
    readonly bold: boolean;
    readonly dim: boolean;
    readonly italic: boolean;
    readonly underline: boolean;
    readonly inverse: boolean;
    readonly strikethrough: boolean;
    /** Resolved CSS foreground color, or null to use the default foreground. */
    readonly foreground: string | null;
    /** Resolved CSS background color, or null to use the default background. */
    readonly background: string | null;
}

export interface TerminalRowSnapshot {
    readonly cells: readonly TerminalCellSnapshot[];
}

export interface TerminalCursorSnapshot {
    readonly x: number;
    readonly y: number;
    readonly visible: boolean;
}

export interface TerminalGridSnapshot {
    /** Visible column count. */
    readonly cols: number;
    /** Visible row count. */
    readonly rows: number;
    /** The terminal-reported window title, or an empty string. */
    readonly title: string;
    /** Cursor position within the visible grid, or null when hidden. */
    readonly cursor: TerminalCursorSnapshot | null;
    /** The visible lines, top to bottom; each line lists its non-empty cells. */
    readonly lines: readonly TerminalRowSnapshot[];
}

/** The live connection state a driver reports to the store. */
export type TerminalDriverStatus = "connecting" | "connected" | "disconnected";

/**
 * The store-side sink a terminal driver pushes authoritative updates into. The
 * driver owns the wire protocol and terminal emulation; it never touches the
 * store directly, only this neutral callback surface, so product state stays
 * free of protocol and Node dependencies.
 */
export interface TerminalReplica {
    /** Reports a connection lifecycle transition. */
    statusUpdate(status: TerminalDriverStatus): void;
    /** Reports a newly rendered grid (from live VT or semantic recovery). */
    gridUpdate(grid: TerminalGridSnapshot): void;
    /** Reports that the underlying process exited with this code. */
    exit(exitCode: number | null): void;
    /** Reports a transient, displayable driver error. */
    error(message: string): void;
}

/**
 * One live terminal driver. It owns the binary protocol client, terminal
 * emulation, and reconnect loop; the store only issues these high-level intents
 * and observes results through the `TerminalReplica` it supplied.
 */
export interface TerminalDriver {
    /** Sends user input bytes to the terminal. */
    write(data: string): void;
    /** Requests a new visible size. */
    resize(cols: number, rows: number): void;
    /** Forces an immediate reconnect attempt. */
    reconnect(): void;
    /** Tears the driver down and releases its resources. */
    close(): void;
}

/**
 * Creates a driver for one terminal. The store supplies a `connect` factory that
 * opens a fresh authenticated byte channel (used for the initial attach and
 * every reconnect), the replica sink, and the initial size. The concrete
 * implementation lives in application code, keeping `happy2-state` free of the
 * protocol library and Node stream types.
 */
export type TerminalDriverCreate = (options: {
    readonly connect: () => TerminalConnection;
    readonly replica: TerminalReplica;
    readonly cols: number;
    readonly rows: number;
}) => TerminalDriver;

export interface TerminalSnapshot {
    readonly status: "connecting" | "connected" | "disconnected" | "exited" | "error";
    /** The current renderable grid, once any output or recovery has arrived. */
    readonly grid?: TerminalGridSnapshot;
    readonly title: string;
    readonly cols: number;
    readonly rows: number;
    readonly exitCode: number | null;
    readonly error?: UserError;
}

export interface TerminalState extends TerminalSnapshot {
    terminalWrite(data: string): void;
    terminalResize(cols: number, rows: number): void;
    terminalReconnect(): void;
    terminalClose(): void;
}

export type TerminalStore = StoreApi<TerminalState>;
export interface TerminalHandle extends TerminalStore, Disposable {}

/**
 * Opens one ephemeral interactive terminal bound to an authorized chat agent
 * session. Creation and stop are ordinary HTTP actions; live output, input,
 * resize, and reconnect ride an injected driver that owns the Rig binary
 * protocol and terminal emulation over an opaque authenticated byte channel.
 * The returned handle is an immutable-snapshot store plus synchronous local
 * actions; disposing it tears down the driver and stops the terminal.
 */
export function terminalOpen(
    runtime: StateRuntime,
    chatId: string,
    agentUserId: string,
    cols = 80,
    rows = 24,
): TerminalHandle {
    let disposed = false;
    let stopRequested = false;
    let terminalId: string | undefined;
    let driver: TerminalDriver | undefined;
    let requestedSize = { cols, rows };
    const pendingWrites: string[] = [];

    const stop = () => {
        if (stopRequested || store.getState().status === "exited") return;
        // Record the close intent first, before any early return, so a close
        // that races an in-flight create still prevents the terminal from
        // attaching; the create-completion path observes this flag and stops the
        // terminal it just created.
        stopRequested = true;
        driver?.close();
        driver = undefined;
        if (!terminalId) return;
        const stopId = terminalId;
        runtime.background(
            runtime
                .operation("stopTerminal", { chatId, agentUserId, terminalId: stopId })
                .then(() => undefined),
        );
    };

    const store = createStore<TerminalState>()(() => ({
        status: "connecting",
        title: "",
        cols,
        rows,
        exitCode: null,
        terminalWrite(data) {
            if (disposed || !data || stopRequested) return;
            if (driver) driver.write(data);
            else pendingWrites.push(data);
        },
        terminalResize(nextCols, nextRows) {
            if (disposed || (requestedSize.cols === nextCols && requestedSize.rows === nextRows))
                return;
            requestedSize = { cols: nextCols, rows: nextRows };
            driver?.resize(nextCols, nextRows);
        },
        terminalReconnect() {
            if (disposed || stopRequested || store.getState().status === "connected") return;
            driver?.reconnect();
        },
        terminalClose() {
            if (!disposed) stop();
        },
    }));

    runtime.background(
        runtime
            .operation("createTerminal", { chatId, agentUserId, cols, rows })
            .then(({ terminal }) => {
                if (disposed || stopRequested) {
                    runtime.background(
                        runtime
                            .operation("stopTerminal", {
                                chatId,
                                agentUserId,
                                terminalId: terminal.id,
                            })
                            .then(() => undefined),
                    );
                    return;
                }
                terminalId = terminal.id;
                store.setState({
                    exitCode: terminal.exitCode,
                    cols: terminal.cols,
                    rows: terminal.rows,
                });
                driver = runtime.terminalDriverCreate({
                    connect: () =>
                        runtime.terminalConnect({
                            chatId,
                            agentUserId,
                            terminalId: terminal.id,
                        }),
                    // Seed the driver from the size the PTY was actually created
                    // at, not the latest requested size; a resize that arrived
                    // while create was in flight is replayed below so the driver
                    // still transmits it instead of collapsing to a no-op.
                    cols: terminal.cols,
                    rows: terminal.rows,
                    replica: {
                        statusUpdate: (status) => {
                            if (!disposed && store.getState().status !== "exited")
                                store.setState({ status, error: undefined });
                        },
                        gridUpdate: (grid) => {
                            if (disposed) return;
                            store.setState({
                                grid,
                                title: grid.title,
                                cols: grid.cols,
                                rows: grid.rows,
                            });
                        },
                        exit: (exitCode) => {
                            if (!disposed) store.setState({ status: "exited", exitCode });
                        },
                        error: (message) => {
                            if (!disposed && store.getState().status !== "exited")
                                store.setState({
                                    status: "disconnected",
                                    error: new UserError(message),
                                });
                        },
                    },
                });
                for (const data of pendingWrites.splice(0)) driver.write(data);
                // A resize requested before create completed is not yet known to
                // the driver; replay it so it reaches the server once connected.
                if (requestedSize.cols !== terminal.cols || requestedSize.rows !== terminal.rows)
                    driver.resize(requestedSize.cols, requestedSize.rows);
            })
            .catch((error: unknown) => {
                if (!disposed)
                    store.setState({
                        status: "error",
                        error:
                            error instanceof UserError ? error : new UserError("Terminal failed."),
                    });
            }),
    );

    return Object.assign(store, {
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            disposed = true;
            driver?.close();
            driver = undefined;
        },
    });
}
