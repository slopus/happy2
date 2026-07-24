import { describe, expect, it, vi } from "vitest";
import type {
    RigGlobalEvent,
    RigSessionId,
    RigTerminalGridProjection,
    RigTerminalId,
} from "happy2-state";
import { RigRendererTransport } from "./rigRendererTransport";
import type {
    HappyDesktopBridge,
    RigStreamEvent,
    RigStreamOpenRequest,
} from "./shared/desktopContract";

const sessionId = "session-renderer" as RigSessionId;
const terminalId = "terminal-renderer" as RigTerminalId;

function bridgeCreate() {
    let receive: ((event: RigStreamEvent) => void) | undefined;
    const opens: {
        request: RigStreamOpenRequest;
        resolve(streamId: string): void;
        reject(error: unknown): void;
    }[] = [];
    const rigStreamClose = vi.fn(async () => undefined);
    const rigTerminalWrite = vi.fn(async () => undefined);
    const rigTerminalResize = vi.fn(async () => undefined);
    const rigTerminalScrollback = vi.fn(async () => ({
        baseRow: 0,
        count: 0,
        historyEpoch: "epoch",
        historyRevision: 0,
        rows: [],
        start: 0,
        totalRows: 0,
    }));
    const unsubscribe = vi.fn();
    const bridge = {
        rigRequest: vi.fn(),
        rigStreamOpen: vi.fn(
            (request: RigStreamOpenRequest) =>
                new Promise<string>((resolve, reject) => {
                    opens.push({ request, resolve, reject });
                }),
        ),
        rigStreamClose,
        rigTerminalWrite,
        rigTerminalResize,
        rigTerminalScrollback,
        rigSubscribe: vi.fn((listener: (event: RigStreamEvent) => void) => {
            receive = listener;
            return unsubscribe;
        }),
    } as unknown as HappyDesktopBridge;
    return {
        bridge,
        emit(event: RigStreamEvent) {
            receive?.(event);
        },
        opens,
        rigStreamClose,
        rigTerminalResize,
        rigTerminalScrollback,
        rigTerminalWrite,
        unsubscribe,
    };
}

describe("renderer Rig stream routing", () => {
    it("replays events emitted before the stream-open response and closes exactly once", async () => {
        const fixture = bridgeCreate();
        const transport = new RigRendererTransport(fixture.bridge);
        const event = {
            cursor: 12,
            kind: "sessionChanged",
            sessionId,
        } satisfies RigGlobalEvent;
        const observer = {
            event: vi.fn(),
            error: vi.fn(),
            end: vi.fn(),
        };

        const close = transport.globalEventsSubscribe(observer, 11);
        expect(fixture.opens[0]?.request).toEqual({ type: "globalEvents", after: 11 });
        fixture.emit({ streamId: "global-1", type: "globalEvent", event });
        fixture.opens[0]!.resolve("global-1");
        await Promise.resolve();

        expect(observer.event).toHaveBeenCalledWith(event);
        close();
        close();
        expect(fixture.rigStreamClose).toHaveBeenCalledOnce();
        expect(fixture.rigStreamClose).toHaveBeenCalledWith("global-1");

        transport[Symbol.dispose]();
        expect(fixture.unsubscribe).toHaveBeenCalledOnce();
        expect(fixture.rigStreamClose).toHaveBeenCalledOnce();
    });

    it("closes a stream that resolves after its subscriber was cancelled", async () => {
        const fixture = bridgeCreate();
        const transport = new RigRendererTransport(fixture.bridge);
        const observer = {
            event: vi.fn(),
            error: vi.fn(),
            end: vi.fn(),
        };

        const close = transport.globalEventsSubscribe(observer);
        close();
        fixture.emit({
            streamId: "late-global",
            type: "globalEvent",
            event: { cursor: 1, kind: "sessionChanged", sessionId },
        });
        fixture.opens[0]!.resolve("late-global");
        await Promise.resolve();

        expect(observer.event).not.toHaveBeenCalled();
        expect(fixture.rigStreamClose).toHaveBeenCalledWith("late-global");
        transport[Symbol.dispose]();
    });

    it("routes terminal events and commands through one owned connection", async () => {
        const fixture = bridgeCreate();
        const transport = new RigRendererTransport(fixture.bridge);
        const observer = {
            connected: vi.fn(),
            grid: vi.fn(),
            exit: vi.fn(),
            error: vi.fn(),
        };
        const connecting = transport.terminalConnect(sessionId, terminalId, observer);
        expect(fixture.opens[0]?.request).toEqual({ type: "terminal", sessionId, terminalId });

        fixture.emit({ streamId: "terminal-1", type: "terminalConnected" });
        fixture.opens[0]!.resolve("terminal-1");
        const connection = await connecting;
        expect(observer.connected).toHaveBeenCalledOnce();

        const grid = terminalGrid();
        fixture.emit({ streamId: "terminal-1", type: "terminalGrid", grid });
        fixture.emit({ streamId: "terminal-1", type: "terminalExited", exitCode: 0 });
        expect(observer.grid).toHaveBeenCalledWith(grid);
        expect(observer.exit).toHaveBeenCalledWith(0);

        connection.write("ls\r");
        connection.resize(120, 40);
        await connection.scrollback(4, 20);
        expect(fixture.rigTerminalWrite).toHaveBeenCalledWith("terminal-1", "ls\r");
        expect(fixture.rigTerminalResize).toHaveBeenCalledWith("terminal-1", 120, 40);
        expect(fixture.rigTerminalScrollback).toHaveBeenCalledWith("terminal-1", 4, 20, undefined);

        connection.close();
        expect(fixture.rigStreamClose).toHaveBeenCalledWith("terminal-1");
        transport[Symbol.dispose]();
    });
});

function terminalGrid(): RigTerminalGridProjection {
    return {
        cols: 80,
        cursor: { x: 2, y: 0, visible: true },
        palette: [],
        revision: 1,
        rows: [{ cells: [], wrapped: false }],
        startRow: 0,
        styles: [],
        title: "Rig",
        totalRows: 1,
    };
}
