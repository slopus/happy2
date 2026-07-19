import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { terminalOpen } from "./terminalState.js";
import type {
    TerminalDriver,
    TerminalDriverCreate,
    TerminalGridSnapshot,
    TerminalReplica,
} from "./terminalState.js";

const summary = {
    id: "terminal-1",
    epoch: "epoch-1",
    status: "running" as const,
    exitCode: null,
    cols: 80,
    rows: 24,
};

function grid(text: string): TerminalGridSnapshot {
    return {
        cols: 80,
        rows: 24,
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
}

/** A programmable driver capturing intents and exposing its replica to the test. */
interface FakeDriver extends TerminalDriver {
    readonly initialSize: { cols: number; rows: number };
    readonly writes: readonly string[];
    readonly resizes: readonly { cols: number; rows: number }[];
    readonly reconnects: number;
    readonly closed: boolean;
    readonly replica: TerminalReplica;
    readonly connect: () => void;
}

function fakeDriverCreate(): { create: TerminalDriverCreate; driver: () => FakeDriver } {
    let built: FakeDriver | undefined;
    const create: TerminalDriverCreate = (options) => {
        const writes: string[] = [];
        const resizes: { cols: number; rows: number }[] = [];
        let reconnects = 0;
        let closed = false;
        const driver: FakeDriver = {
            initialSize: { cols: options.cols, rows: options.rows },
            writes,
            resizes,
            get reconnects() {
                return reconnects;
            },
            get closed() {
                return closed;
            },
            replica: options.replica,
            connect: () => options.connect(),
            write: (data) => writes.push(data),
            resize: (cols, rows) => resizes.push({ cols, rows }),
            reconnect: () => {
                reconnects += 1;
            },
            close: () => {
                closed = true;
            },
        };
        built = driver;
        return driver;
    };
    return {
        create,
        driver: () => {
            if (!built) throw new Error("Driver was not created.");
            return built;
        },
    };
}

describe("terminal surface", () => {
    it("creates, drives input output resize reconnect exit and stops on close", async () => {
        const server = createFakeServer();
        server.route("POST", /createTerminal$/u, () => jsonResponse(201, { terminal: summary }));
        server.route("POST", /stopTerminal$/u, () =>
            jsonResponse(200, { terminal: { ...summary, status: "exited", exitCode: 0 } }),
        );
        const { create, driver } = fakeDriverCreate();
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
            terminalDriverCreate: create,
        });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        await runtime.whenIdle();

        // The driver's connect factory opens an authenticated channel to the terminal.
        driver().connect();
        expect(server.terminalConnects).toEqual([
            { chatId: "chat-1", agentUserId: "agent-1", terminalId: "terminal-1" },
        ]);

        driver().replica.statusUpdate("connected");
        expect(terminal.getState().status).toBe("connected");

        terminal.getState().terminalWrite("pwd\r");
        expect(driver().writes).toEqual(["pwd\r"]);

        driver().replica.gridUpdate(grid("ready"));
        expect(terminal.getState().grid).toEqual(grid("ready"));

        terminal.getState().terminalResize(100, 30);
        expect(driver().resizes).toEqual([{ cols: 100, rows: 30 }]);

        driver().replica.statusUpdate("disconnected");
        expect(terminal.getState().status).toBe("disconnected");
        terminal.getState().terminalReconnect();
        expect(driver().reconnects).toBe(1);

        terminal.getState().terminalClose();
        await runtime.whenIdle();
        expect(driver().closed).toBe(true);
        expect(server.requests.some((request) => request.path.endsWith("/stopTerminal"))).toBe(
            true,
        );

        terminal[Symbol.dispose]();
    });

    it("buffers input written before the driver exists and flushes it once created", async () => {
        const server = createFakeServer();
        let release!: () => void;
        server.route("POST", /createTerminal$/u, async () => {
            await new Promise<void>((resolve) => (release = resolve));
            return jsonResponse(201, { terminal: summary });
        });
        server.route("POST", /stopTerminal$/u, () => jsonResponse(200, { terminal: summary }));
        const { create, driver } = fakeDriverCreate();
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
            terminalDriverCreate: create,
        });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        terminal.getState().terminalWrite("early\r");
        release();
        await runtime.whenIdle();
        expect(driver().writes).toEqual(["early\r"]);
        terminal[Symbol.dispose]();
    });

    it("replays a resize that arrived while create was in flight", async () => {
        const server = createFakeServer();
        let release!: () => void;
        server.route("POST", /createTerminal$/u, async () => {
            await new Promise<void>((resolve) => (release = resolve));
            // The PTY is created at the originally requested 80x24.
            return jsonResponse(201, { terminal: summary });
        });
        server.route("POST", /stopTerminal$/u, () => jsonResponse(200, { terminal: summary }));
        const { create, driver } = fakeDriverCreate();
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
            terminalDriverCreate: create,
        });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        // Resize before the create response arrives.
        terminal.getState().terminalResize(120, 40);
        release();
        await runtime.whenIdle();
        // The driver is seeded from the actual PTY size, and the pre-create
        // resize is replayed so it is not collapsed to a no-op.
        expect(driver().initialSize).toEqual({ cols: 80, rows: 24 });
        expect(driver().resizes).toContainEqual({ cols: 120, rows: 40 });
        terminal[Symbol.dispose]();
    });

    it("never attaches when closed before create completes", async () => {
        const server = createFakeServer();
        let release!: () => void;
        server.route("POST", /createTerminal$/u, async () => {
            await new Promise<void>((resolve) => (release = resolve));
            return jsonResponse(201, { terminal: summary });
        });
        server.route("POST", /stopTerminal$/u, () => jsonResponse(200, { terminal: summary }));
        const { create, driver } = fakeDriverCreate();
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
            terminalDriverCreate: create,
        });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        // Close while create is still in flight; the close intent must win.
        terminal.getState().terminalClose();
        release();
        await runtime.whenIdle();
        expect(() => driver()).toThrow();
        expect(server.requests.some((request) => request.path.endsWith("/stopTerminal"))).toBe(
            true,
        );
        terminal[Symbol.dispose]();
    });

    it("exits without stopping and reports create failures", async () => {
        const server = createFakeServer();
        server.respond("POST", /createTerminal$/u, jsonResponse(500, { error: "boom" }));
        const { create } = fakeDriverCreate();
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
            terminalDriverCreate: create,
        });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        await runtime.whenIdle();
        expect(terminal.getState().status).toBe("error");
        expect(terminal.getState().error).toBeDefined();
        terminal[Symbol.dispose]();
    });
});
