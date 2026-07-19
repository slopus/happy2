import type { Duplex } from "node:stream";
import {
    RemoteTerminalProtocolClient,
    type RemoteTerminalGridState,
    type RemoteTerminalMode,
    type RemoteTerminalReconnectState,
} from "@slopus/ghostty-web";
import type {
    TerminalCellSnapshot,
    TerminalConnection,
    TerminalDriver,
    TerminalDriverCreate,
    TerminalGridSnapshot,
    TerminalReplica,
} from "happy2-state";
import { ghosttyEmulatorCreate, type TerminalEmulator } from "./ghosttyTerminal";

const RECONNECT_DELAY_MS = 500;
const TERMINAL_CLIENT_ID = "happy2-terminal";
/** The protocol rejects any single input frame larger than 64 KiB. */
const MAX_INPUT_BYTES = 64 * 1024;

interface Size {
    cols: number;
    rows: number;
}

type EmulatorCreate = (cols: number, rows: number) => Promise<TerminalEmulator>;

/**
 * Builds a terminal driver over an injected emulator factory. Production wires
 * the Ghostty WebAssembly emulator; tests pass a deterministic emulator so the
 * real protocol, reconnect, and lifecycle logic can be exercised without WASM.
 */
export function terminalDriverCreateWith(emulatorCreate: EmulatorCreate): TerminalDriverCreate {
    return (options) =>
        new GhosttyTerminalDriver(
            options.connect,
            options.replica,
            options.cols,
            options.rows,
            emulatorCreate,
        );
}

/**
 * The terminal driver `happy2-state` needs: it owns the Rig binary protocol
 * client, the Ghostty WebAssembly emulator that parses live VT output, and the
 * reconnect loop. The store only issues intents and receives normalized grid
 * snapshots, so the protocol library and Node stream types stay in the app.
 */
export const terminalDriverCreate: TerminalDriverCreate =
    terminalDriverCreateWith(ghosttyEmulatorCreate);

class GhosttyTerminalDriver implements TerminalDriver {
    private emulator: TerminalEmulator | undefined;
    private protocol: RemoteTerminalProtocolClient | undefined;
    private connection: TerminalConnection | undefined;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingReconnect: RemoteTerminalReconnectState | undefined;
    private mode: RemoteTerminalMode | undefined;
    /** The size the UI wants; the newest request always wins (coalesced). */
    private desiredSize: Size;
    /** The size the protocol has acknowledged and applied to the emulator. */
    private appliedSize: Size;
    private resizeInFlight = false;
    private connected = false;
    private exited = false;
    private closed = false;
    private readonly pendingWrites: string[] = [];

    constructor(
        private readonly connect: () => TerminalConnection,
        private readonly replica: TerminalReplica,
        cols: number,
        rows: number,
        private readonly emulatorCreate: EmulatorCreate,
    ) {
        this.desiredSize = { cols, rows };
        this.appliedSize = { cols, rows };
        void this.start();
    }

    write(data: string): void {
        if (this.closed || this.exited || !data) return;
        const chunks = chunkUtf8(data, MAX_INPUT_BYTES);
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index]!;
            if (!this.connected || !this.protocol) {
                this.pendingWrites.push(chunk);
                continue;
            }
            try {
                this.protocol.writeInput(chunk);
            } catch {
                // A closed or saturated channel keeps the rest ordered for the
                // reconnect's replay instead of throwing into the UI event.
                this.pendingWrites.push(...chunks.slice(index));
                return;
            }
        }
    }

    resize(cols: number, rows: number): void {
        if (this.closed || this.exited) return;
        this.desiredSize = { cols, rows };
        this.flushResize();
    }

    reconnect(): void {
        if (this.closed || this.exited || this.protocol) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.attach();
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.teardown();
    }

    private teardown(): void {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.connected = false;
        this.protocol?.close();
        this.protocol = undefined;
        this.connection?.destroy();
        this.connection = undefined;
        this.emulator?.dispose();
        this.emulator = undefined;
    }

    private async start(): Promise<void> {
        try {
            this.emulator = await this.emulatorCreate(this.desiredSize.cols, this.desiredSize.rows);
        } catch {
            if (!this.closed) this.replica.error("The terminal emulator failed to load.");
            return;
        }
        if (this.closed || this.exited) {
            this.emulator.dispose();
            this.emulator = undefined;
            return;
        }
        this.attach();
    }

    private attach(): void {
        if (this.closed || this.exited) return;
        const reconnectState = this.pendingReconnect;
        this.pendingReconnect = undefined;
        this.connected = false;
        this.mode = undefined;
        this.replica.statusUpdate("connecting");
        let client: RemoteTerminalProtocolClient;
        try {
            const connection = this.connect();
            this.connection = connection;
            client = new RemoteTerminalProtocolClient({
                clientId: TERMINAL_CLIENT_ID,
                capabilities: { grid: true, vt: true },
                stream: connection as unknown as Duplex,
                // The server declares its epoch in the welcome frame on a fresh
                // attach; only a reconnect asserts the epoch it previously learned.
                ...(reconnectState?.epoch === undefined ? {} : { epoch: reconnectState.epoch }),
                ...(reconnectState?.inputLease === undefined
                    ? {}
                    : { inputLease: reconnectState.inputLease }),
                ...(reconnectState
                    ? {
                          pendingInputs: reconnectState.pendingInputs,
                          resumeInputSequence: reconnectState.resumeInputSequence,
                          resumeOutputOffset: reconnectState.resumeOutputOffset,
                      }
                    : {}),
                onMode: (mode) => {
                    this.mode = mode;
                },
                onExit: (exitCode) => this.onExit(exitCode),
                replica: {
                    applyGrid: (state) => this.pushGridFromRecovery(state),
                    applyVt: (data) => {
                        this.emulator?.write(data);
                        this.pushGridFromEmulator();
                    },
                    // The protocol calls this at the ordered resize barrier. Apply
                    // the acknowledged size to the emulator, but only publish an
                    // emulator grid in VT mode; in grid mode the server's semantic
                    // snapshot is authoritative and must not be overwritten.
                    resize: (cols, rows) => {
                        this.appliedSize = { cols, rows };
                        this.emulator?.resize(cols, rows);
                        if (this.mode === "vt") this.pushGridFromEmulator();
                    },
                },
            });
        } catch (error) {
            this.onAttachFailure(error);
            return;
        }
        this.protocol = client;
        this.connection?.once("close", () => this.onConnectionLost(client));
        this.connection?.once("error", (error) => this.onConnectionLost(client, error));
        client.ready.then(
            () => {
                if (this.closed || this.exited || this.protocol !== client) return;
                this.connected = true;
                this.replica.statusUpdate("connected");
                this.flushWrites();
                this.flushResize();
            },
            () => undefined,
        );
    }

    private onExit(exitCode: number | null): void {
        if (this.closed || this.exited) return;
        // Keep the final grid and exit status in the store, but stop the
        // protocol/socket and free the emulator, and never reconnect.
        this.exited = true;
        this.replica.exit(exitCode);
        this.teardown();
    }

    private onAttachFailure(error: unknown): void {
        this.connection?.destroy();
        this.connection = undefined;
        this.protocol = undefined;
        this.connected = false;
        this.replica.statusUpdate("disconnected");
        this.replica.error(error instanceof Error ? error.message : "The terminal failed.");
        this.scheduleReconnect();
    }

    private onConnectionLost(client: RemoteTerminalProtocolClient, error?: Error): void {
        if (this.closed || this.exited || this.protocol !== client) return;
        this.pendingReconnect = safeReconnectState(client);
        client.close();
        this.protocol = undefined;
        this.connection = undefined;
        this.connected = false;
        this.mode = undefined;
        this.replica.statusUpdate("disconnected");
        if (error) this.replica.error(error.message);
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.attach();
        }, RECONNECT_DELAY_MS);
    }

    private flushWrites(): void {
        if (!this.protocol || !this.connected) return;
        const pending = this.pendingWrites.splice(0);
        for (let index = 0; index < pending.length; index += 1) {
            try {
                this.protocol.writeInput(pending[index]!);
            } catch {
                this.pendingWrites.unshift(...pending.slice(index));
                return;
            }
        }
    }

    private flushResize(): void {
        if (!this.protocol || !this.connected || this.resizeInFlight) return;
        if (sizesEqual(this.desiredSize, this.appliedSize)) return;
        const target = this.desiredSize;
        this.resizeInFlight = true;
        const client = this.protocol;
        client.resize(target.cols, target.rows).then(
            () => {
                this.resizeInFlight = false;
                if (this.protocol === client) this.flushResize();
            },
            () => {
                this.resizeInFlight = false;
            },
        );
    }

    private pushGridFromEmulator(): void {
        if (this.emulator) this.replica.gridUpdate(this.emulator.snapshot());
    }

    private pushGridFromRecovery(state: RemoteTerminalGridState): void {
        this.replica.gridUpdate(gridStateToSnapshot(state));
    }
}

/** Splits text into chunks whose UTF-8 encoding never exceeds the frame limit. */
function chunkUtf8(data: string, maxBytes: number): string[] {
    // Every code point encodes to at most 4 bytes, so this many chars always fit.
    if (data.length <= maxBytes / 4) return [data];
    const encoder = new TextEncoder();
    const chunks: string[] = [];
    let current = "";
    let currentBytes = 0;
    for (const codePoint of data) {
        const size = encoder.encode(codePoint).length;
        if (currentBytes + size > maxBytes && current) {
            chunks.push(current);
            current = "";
            currentBytes = 0;
        }
        current += codePoint;
        currentBytes += size;
    }
    if (current) chunks.push(current);
    return chunks;
}

function sizesEqual(a: Size, b: Size): boolean {
    return a.cols === b.cols && a.rows === b.rows;
}

function safeReconnectState(
    client: RemoteTerminalProtocolClient,
): RemoteTerminalReconnectState | undefined {
    try {
        return client.reconnectState();
    } catch {
        return undefined;
    }
}

/** Converts a Rig semantic grid recovery frame into the normalized render model. */
function gridStateToSnapshot(state: RemoteTerminalGridState): TerminalGridSnapshot {
    const palette = state.palette;
    const styles = state.styles;
    return {
        cols: state.cols,
        rows: state.rows.length,
        title: state.title,
        cursor: state.cursor
            ? { x: state.cursor.x, y: state.cursor.y, visible: state.cursor.visible }
            : null,
        lines: state.rows.map((row) => ({
            cells: row.cells.map((cell): TerminalCellSnapshot => {
                const style = styles[cell.styleId] as Record<string, unknown> | undefined;
                return {
                    x: cell.x,
                    text: cell.text,
                    width: cell.width,
                    bold: styleFlag(style, "bold"),
                    dim: styleFlag(style, "dim"),
                    italic: styleFlag(style, "italic"),
                    underline: styleUnderline(style),
                    inverse: styleFlag(style, "inverse"),
                    strikethrough: styleFlag(style, "strikethrough"),
                    foreground: resolveColor(style?.foreground, palette),
                    background: resolveColor(style?.background, palette),
                };
            }),
        })),
    };
}

function styleFlag(style: Record<string, unknown> | undefined, key: string): boolean {
    return style?.[key] === true;
}

function styleUnderline(style: Record<string, unknown> | undefined): boolean {
    const value = style?.underline;
    return value === true || (typeof value === "string" && value !== "none");
}

/** Resolves a palette index, RGB triple, or CSS string style color to a CSS color. */
function resolveColor(value: unknown, palette: readonly string[]): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value.length > 0 ? value : null;
    if (typeof value === "number") return palette[value] ?? null;
    if (typeof value === "object") {
        const color = value as Record<string, unknown>;
        if (color.kind === "palette" && typeof color.index === "number")
            return palette[color.index] ?? null;
        if (
            color.kind === "rgb" &&
            typeof color.red === "number" &&
            typeof color.green === "number" &&
            typeof color.blue === "number"
        )
            return `rgb(${color.red} ${color.green} ${color.blue})`;
    }
    return null;
}
