import { Duplex } from "node:stream";
import { RemoteTerminalProtocolServer } from "@slopus/ghostty-web";
import type { TerminalConnection, TerminalGridSnapshot, TerminalReplica } from "happy2-state";
import { expect, it } from "vitest";
import { terminalDriverCreateWith } from "./terminalDriver";
import type { TerminalEmulator } from "./ghosttyTerminal";

/** Deterministic emulator that renders written bytes as a single line of text. */
function fakeEmulator(): TerminalEmulator {
    let text = "";
    let cols = 80;
    let rows = 24;
    return {
        write(data) {
            text += Buffer.from(data).toString("utf8");
        },
        resize(nextCols, nextRows) {
            cols = nextCols;
            rows = nextRows;
        },
        snapshot(): TerminalGridSnapshot {
            return {
                cols,
                rows,
                title: "Terminal",
                cursor: { x: text.length, y: 0, visible: true },
                lines: [
                    {
                        cells: [
                            {
                                x: 0,
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
                            },
                        ],
                    },
                ],
            };
        },
        dispose() {
            text = "";
        },
    };
}

/** Pairs a store-side TerminalConnection with the terminal-side node Duplex. */
function connectionPair(): { connection: TerminalConnection; serverStream: Duplex } {
    const dataListeners = new Set<(chunk: Uint8Array) => void>();
    const closeListeners = new Set<() => void>();
    let paused = false;
    let destroyed = false;
    const inbound: Uint8Array[] = [];
    const deliver = (chunk: Uint8Array) => {
        if (paused) inbound.push(chunk);
        else for (const listener of dataListeners) listener(chunk);
    };
    const serverStream = new Duplex({
        read() {},
        write(chunk: Buffer, _encoding, callback) {
            deliver(new Uint8Array(chunk));
            callback();
        },
        destroy(error, callback) {
            if (!destroyed) {
                destroyed = true;
                for (const listener of closeListeners) listener();
            }
            callback(error);
        },
    });
    const connection: TerminalConnection = {
        on: (_event, listener) => {
            dataListeners.add(listener);
        },
        once: (event, listener) => {
            if (event === "close") closeListeners.add(listener as () => void);
        },
        write: (chunk) => {
            if (!destroyed) serverStream.push(Buffer.from(chunk));
        },
        pause: () => {
            paused = true;
        },
        resume: () => {
            paused = false;
            for (const chunk of inbound.splice(0)) deliver(chunk);
        },
        destroy: () => {
            if (!destroyed) {
                destroyed = true;
                for (const listener of closeListeners) listener();
                serverStream.destroy();
            }
        },
        get destroyed() {
            return destroyed;
        },
    };
    return { connection, serverStream };
}

function serverGrid(text: string) {
    return {
        cols: 80,
        cursor: { visible: true, x: text.length, y: 0 },
        palette: [],
        rows: text
            ? [{ cells: [{ styleId: 0, text, width: 1 as const, x: 0 }], wrapped: false }]
            : [],
        startRow: 0,
        styles: [{}],
        title: "Terminal",
        totalRows: 24,
    };
}

function recordingReplica() {
    const statuses: string[] = [];
    const grids: TerminalGridSnapshot[] = [];
    let exitCode: number | null | undefined;
    const replica: TerminalReplica = {
        statusUpdate: (status) => statuses.push(status),
        gridUpdate: (grid) => grids.push(grid),
        exit: (code) => {
            exitCode = code;
        },
        error: () => undefined,
    };
    return {
        replica,
        statuses,
        grids,
        get exitCode() {
            return exitCode;
        },
    };
}

async function tick(): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
}

it("drives the real Rig protocol: input, output, resize, exit", async () => {
    const inputs: string[] = [];
    const resizes: { cols: number; rows: number }[] = [];
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: (data) => {
            inputs.push(Buffer.from(data).toString("utf8"));
        },
        onResize: (cols, rows) => {
            resizes.push({ cols, rows });
        },
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });

    const pair = connectionPair();
    protocol.attach(pair.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => pair.connection,
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    expect(observed.statuses).toContain("connected");

    driver.write("pwd\r");
    await tick();
    expect(inputs).toEqual(["pwd\r"]);

    protocol.publishUpdate(Buffer.from("ready"), serverGrid("ready"));
    await tick();
    expect(gridText(observed.grids.at(-1))).toContain("ready");

    driver.resize(100, 30);
    await tick();
    expect(resizes.at(-1)).toEqual({ cols: 100, rows: 30 });

    protocol.publishExit(0);
    await tick();
    expect(observed.exitCode).toBe(0);

    driver.close();
});

it("reconnects the real protocol after the channel drops", async () => {
    const inputs: string[] = [];
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: (data) => {
            inputs.push(Buffer.from(data).toString("utf8"));
        },
        onResize: () => undefined,
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });

    let connects = 0;
    let current = connectionPair();
    protocol.attach(current.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => {
            connects += 1;
            if (connects === 1) return current.connection;
            current = connectionPair();
            protocol.attach(current.serverStream);
            return current.connection;
        },
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    expect(observed.statuses).toContain("connected");

    current.connection.destroy();
    await tick();
    expect(observed.statuses).toContain("disconnected");

    // The driver reconnects on a fixed 500 ms timer.
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    await tick();
    expect(connects).toBeGreaterThanOrEqual(2);

    driver.write("echo hi\r");
    await tick();
    expect(inputs).toContain("echo hi\r");

    driver.close();
});

it("preserves pending input across a manual reconnect", async () => {
    const inputs: string[] = [];
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: (data) => {
            inputs.push(Buffer.from(data).toString("utf8"));
        },
        onResize: () => undefined,
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });

    let current = connectionPair();
    protocol.attach(current.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => {
            const next = current;
            current = connectionPair();
            protocol.attach(current.serverStream);
            return next.connection;
        },
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    expect(observed.statuses).toContain("connected");

    // Write, then drop the channel before the server can acknowledge, so the
    // input is only held in the protocol's pending state.
    const live = current;
    driver.write("resumed\r");
    live.connection.destroy();
    // Reconnect manually, before the automatic 500 ms timer fires.
    driver.reconnect();
    await tick();
    expect(inputs).toContain("resumed\r");
    driver.close();
});

it("applies a resize requested before the protocol is ready", async () => {
    const resizes: { cols: number; rows: number }[] = [];
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: () => undefined,
        onResize: (cols, rows) => {
            resizes.push({ cols, rows });
        },
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });
    const pair = connectionPair();
    protocol.attach(pair.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => pair.connection,
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    // Resize immediately, before the emulator loads or the welcome arrives.
    driver.resize(120, 40);
    await tick();
    expect(observed.statuses).toContain("connected");
    expect(resizes).toContainEqual({ cols: 120, rows: 40 });
    driver.close();
});

it("coalesces rapid resizes to at most one in flight", async () => {
    const resizes: { cols: number; rows: number }[] = [];
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: () => undefined,
        onResize: (cols, rows) => {
            resizes.push({ cols, rows });
        },
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });
    const pair = connectionPair();
    protocol.attach(pair.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => pair.connection,
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    expect(observed.statuses).toContain("connected");

    driver.resize(90, 20);
    driver.resize(100, 30);
    driver.resize(110, 40);
    await tick();
    await tick();
    // The intermediate size is coalesced away; only the first and the latest
    // reach the server, and never more than one is in flight at a time.
    expect(resizes.at(-1)).toEqual({ cols: 110, rows: 40 });
    expect(resizes).not.toContainEqual({ cols: 100, rows: 30 });
    expect(resizes.length).toBeLessThanOrEqual(2);
    driver.close();
});

it("keeps the server semantic grid authoritative in grid mode", async () => {
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        // A fingerprint the client cannot match forces semantic grid mode.
        parserFingerprint: "grid-mode-only",
        onInput: () => undefined,
        onResize: () => undefined,
    });
    protocol.publishGrid({ ...serverGrid("SERVER"), coversOutputOffset: 0 });
    const pair = connectionPair();
    protocol.attach(pair.serverStream);
    const observed = recordingReplica();
    // A distinct emulator whose snapshot must never surface in grid mode.
    const driver = terminalDriverCreateWith(() => Promise.resolve(sentinelEmulator("EMULATOR")))({
        connect: () => pair.connection,
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    expect(observed.statuses).toContain("connected");

    driver.resize(100, 30);
    await tick();
    await tick();
    expect(observed.grids.some((grid) => gridText(grid).includes("SERVER"))).toBe(true);
    // The stale emulator snapshot must never overwrite the server grid, not at
    // welcome and not at the resize barrier.
    expect(observed.grids.every((grid) => !gridText(grid).includes("EMULATOR"))).toBe(true);
    driver.close();
});

it("tears down on exit, retains the final grid, and never reconnects", async () => {
    let connects = 0;
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: () => undefined,
        onResize: () => undefined,
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });
    let pair = connectionPair();
    protocol.attach(pair.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => {
            connects += 1;
            if (connects === 1) return pair.connection;
            pair = connectionPair();
            protocol.attach(pair.serverStream);
            return pair.connection;
        },
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    protocol.publishUpdate(Buffer.from("done"), serverGrid("done"));
    await tick();
    const finalGrid = observed.grids.at(-1);

    protocol.publishExit(3);
    await tick();
    expect(observed.exitCode).toBe(3);
    expect(pair.connection.destroyed).toBe(true);

    // No reconnect after exit, even past the reconnect delay.
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    await tick();
    expect(connects).toBe(1);
    expect(observed.statuses.filter((status) => status === "connecting")).toHaveLength(1);
    // The final grid remains the last thing the store observed.
    expect(observed.grids.at(-1)).toBe(finalGrid);
    driver.close();
});

it("reports a construction failure without an uncaught error", async () => {
    const observed = recordingReplica();
    const errors: string[] = [];
    observed.replica.error = (message) => errors.push(message);
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => {
            throw new Error("connect exploded");
        },
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();
    expect(observed.statuses).toContain("disconnected");
    expect(errors).toContain("connect exploded");
    driver.close();
});

it("splits a paste larger than the 64 KiB input frame limit", async () => {
    const frames: Buffer[] = [];
    const protocol = new RemoteTerminalProtocolServer({
        initialCols: 80,
        initialRows: 24,
        onInput: (data) => {
            frames.push(Buffer.from(data));
        },
        onResize: () => undefined,
    });
    protocol.publishGrid({ ...serverGrid(""), coversOutputOffset: 0 });
    const pair = connectionPair();
    protocol.attach(pair.serverStream);
    const observed = recordingReplica();
    const driver = terminalDriverCreateWith(() => Promise.resolve(fakeEmulator()))({
        connect: () => pair.connection,
        replica: observed.replica,
        cols: 80,
        rows: 24,
    });
    await tick();

    const paste = "x".repeat(100_000);
    expect(() => driver.write(paste)).not.toThrow();
    await tick();
    await tick();
    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) expect(frame.length).toBeLessThanOrEqual(64 * 1024);
    expect(Buffer.concat(frames).toString("utf8")).toBe(paste);
    driver.close();
});

function sentinelEmulator(text: string): TerminalEmulator {
    return {
        write: () => undefined,
        resize: () => undefined,
        snapshot: (): TerminalGridSnapshot => ({
            cols: 80,
            rows: 24,
            title: "Terminal",
            cursor: null,
            lines: [
                {
                    cells: [
                        {
                            x: 0,
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
                        },
                    ],
                },
            ],
        }),
        dispose: () => undefined,
    };
}

function gridText(grid: TerminalGridSnapshot | undefined): string {
    return (grid?.lines ?? []).flatMap((line) => line.cells.map((cell) => cell.text)).join("");
}
