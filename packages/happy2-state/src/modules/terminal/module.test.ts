import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse, type FakeStreamController } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { terminalOpen } from "./terminalState.js";

describe("terminal surface", () => {
    it("creates, streams, writes, resizes, stops, and cancels on disposal", async () => {
        const server = createFakeServer();
        const frame = {
            id: "terminal-1",
            revision: 0,
            status: "running" as const,
            exitCode: null,
            cols: 80,
            totalRows: 24,
            title: "Terminal",
            cursor: null,
            rows: [],
        };
        server.route("POST", /createTerminal$/u, () => jsonResponse(201, { terminal: frame }));
        server.route("POST", /writeTerminal$/u, () => jsonResponse(200, { accepted: true }));
        server.route("POST", /resizeTerminal$/u, () =>
            jsonResponse(200, { terminal: { ...frame, cols: 100, totalRows: 30 } }),
        );
        server.route("POST", /stopTerminal$/u, () =>
            jsonResponse(200, { terminal: { ...frame, status: "exited", exitCode: 0 } }),
        );
        let stream!: FakeStreamController;
        server.streamRoute("GET", /\/stream\?after=0$/u, (_request, controller) => {
            stream = controller;
        });
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        await runtime.whenIdle();
        expect(terminal.getState()).toMatchObject({ status: "connecting", frame });
        stream.event("frame", { ...frame, revision: 1, title: "Ready" });
        expect(terminal.getState()).toMatchObject({ status: "connected", frame: { revision: 1 } });
        terminal.getState().terminalWrite("pwd\r");
        terminal.getState().terminalResize(100, 30);
        terminal.getState().terminalClose();
        await runtime.whenIdle();
        expect(server.requests.map((request) => request.path)).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/writeTerminal$/u),
                expect.stringMatching(/resizeTerminal$/u),
                expect.stringMatching(/stopTerminal$/u),
            ]),
        );
        terminal[Symbol.dispose]();
        expect(stream.aborted).toBe(true);
    });

    it("deduplicates equal sizes and coalesces resize bursts", async () => {
        const server = createFakeServer();
        const frame = {
            id: "terminal-1",
            revision: 0,
            status: "running" as const,
            exitCode: null,
            cols: 80,
            totalRows: 24,
            title: "Terminal",
            cursor: null,
            rows: [],
        };
        server.route("POST", /createTerminal$/u, () => jsonResponse(201, { terminal: frame }));
        let releaseFirst!: () => void;
        let resizeCount = 0;
        server.route("POST", /resizeTerminal$/u, async () => {
            resizeCount += 1;
            if (resizeCount === 1) await new Promise<void>((resolve) => (releaseFirst = resolve));
            return jsonResponse(200, { terminal: frame });
        });
        server.streamRoute("GET", /\/stream\?after=0$/u, () => undefined);
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const terminal = terminalOpen(runtime, "chat-1", "agent-1");
        await runtime.whenIdle();

        terminal.getState().terminalResize(80, 24);
        terminal.getState().terminalResize(100, 30);
        terminal.getState().terminalResize(101, 31);
        terminal.getState().terminalResize(101, 31);
        terminal.getState().terminalResize(102, 32);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(resizeCount).toBe(1);
        releaseFirst();
        await runtime.whenIdle();

        const resizeRequests = server.requests.filter((request) =>
            request.path.endsWith("/resizeTerminal"),
        );
        expect(resizeRequests).toHaveLength(2);
        expect(resizeRequests[1]!.body).toEqual({ cols: 102, rows: 32 });
        terminal[Symbol.dispose]();
    });
});
