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
});
