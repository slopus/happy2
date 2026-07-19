import { createStore, type StoreApi } from "zustand/vanilla";
import type { TerminalFrame } from "../../backend.js";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { UserError } from "../../types.js";

export interface TerminalSnapshot {
    readonly status: "connecting" | "connected" | "disconnected" | "exited" | "error";
    readonly frame?: TerminalFrame;
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

export function terminalOpen(
    runtime: StateRuntime,
    chatId: string,
    agentUserId: string,
    cols = 80,
    rows = 24,
): TerminalHandle {
    let cancelStream: (() => void) | undefined;
    let disposed = false;
    let stopRequested = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeInFlight = false;
    let requestedSize: { cols: number; rows: number } | undefined = { cols, rows };
    let pendingSize: { cols: number; rows: number } | undefined;
    const identity = () => {
        const frame = store.getState().frame;
        return frame ? { chatId, agentUserId, terminalId: frame.id } : undefined;
    };
    const streamStart = () => {
        const terminal = identity();
        if (!terminal || disposed || terminalFrameExited(store.getState().frame)) return;
        cancelStream?.();
        store.setState({ status: "connecting", error: undefined });
        cancelStream = runtime.operationStream(
            "streamTerminal",
            { ...terminal, after: store.getState().frame?.revision },
            {
                onEvent(event) {
                    if (disposed || event.event !== "frame") return;
                    const frame = event.data as TerminalFrame;
                    store.setState({
                        frame,
                        status: frame.status === "exited" ? "exited" : "connected",
                        error: undefined,
                    });
                },
                onEnd() {
                    if (disposed || terminalFrameExited(store.getState().frame)) return;
                    store.setState({ status: "disconnected" });
                    reconnectTimer = setTimeout(streamStart, 500);
                },
                onError(error) {
                    if (disposed) return;
                    store.setState({ status: "disconnected", error });
                    reconnectTimer = setTimeout(streamStart, 500);
                },
            },
        );
    };
    const stop = () => {
        const terminal = identity();
        if (!terminal || stopRequested || terminalFrameExited(store.getState().frame)) return;
        stopRequested = true;
        runtime.background(runtime.operation("stopTerminal", terminal).then(() => undefined));
    };
    const resizeSend = (nextCols: number, nextRows: number) => {
        const terminal = identity();
        if (disposed) return;
        if (!terminal) {
            pendingSize = { cols: nextCols, rows: nextRows };
            return;
        }
        resizeInFlight = true;
        runtime.background(
            runtime
                .operation("resizeTerminal", {
                    ...terminal,
                    cols: nextCols,
                    rows: nextRows,
                })
                .then(({ terminal: frame }) => {
                    if (!disposed && frame.revision >= (store.getState().frame?.revision ?? -1))
                        store.setState({ frame });
                })
                .catch((error: unknown) => {
                    if (requestedSize?.cols === nextCols && requestedSize.rows === nextRows)
                        requestedSize = undefined;
                    throw error;
                })
                .finally(() => {
                    resizeInFlight = false;
                    const next = pendingSize;
                    pendingSize = undefined;
                    if (next && !disposed) resizeSend(next.cols, next.rows);
                }),
        );
    };
    const store = createStore<TerminalState>()(() => ({
        status: "connecting",
        terminalWrite(data) {
            const terminal = identity();
            if (!terminal || disposed || !data) return;
            runtime.background(
                runtime.operation("writeTerminal", { ...terminal, data }).then(() => undefined),
            );
        },
        terminalResize(nextCols, nextRows) {
            if (disposed || (requestedSize?.cols === nextCols && requestedSize.rows === nextRows))
                return;
            requestedSize = { cols: nextCols, rows: nextRows };
            if (resizeInFlight) pendingSize = requestedSize;
            else resizeSend(nextCols, nextRows);
        },
        terminalReconnect: streamStart,
        terminalClose() {
            if (!disposed) stop();
        },
    }));
    runtime.background(
        runtime
            .operation("createTerminal", { chatId, agentUserId, cols, rows })
            .then(({ terminal: frame }) => {
                if (disposed) {
                    runtime.background(
                        runtime
                            .operation("stopTerminal", {
                                chatId,
                                agentUserId,
                                terminalId: frame.id,
                            })
                            .then(() => undefined),
                    );
                    return;
                }
                store.setState({ frame, status: "connected" });
                const next = pendingSize;
                pendingSize = undefined;
                if (next && (next.cols !== frame.cols || next.rows !== frame.totalRows))
                    resizeSend(next.cols, next.rows);
                streamStart();
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
            cancelStream?.();
            if (reconnectTimer) clearTimeout(reconnectTimer);
        },
    });
}

function terminalFrameExited(frame: TerminalFrame | undefined): boolean {
    return frame?.status === "exited";
}
