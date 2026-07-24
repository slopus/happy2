import { describe, expect, it, vi } from "vitest";
import {
    rigStateCreate,
    type RigEventId,
    type RigSessionId,
    type RigTerminalId,
} from "../src/index.js";
import {
    createFakeRigTransport,
    fakeRigSession,
    type FakeRigTerminalController,
} from "../src/testing/index.js";

describe("RigState terminals", () => {
    it("creates, attaches, drives, reconnects, and disposes terminals independently", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-terminal" as RigSessionId;
        fake.sessionSet(
            fakeRigSession(sessionId, {
                lastEventId: "event-terminal-edge" as RigEventId,
            }),
        );
        using state = rigStateCreate({ transport: fake.transport });
        using list = state.terminalListOpen(sessionId);
        await state.whenIdle();
        expect(
            fake.calls.filter(({ operation }) => operation === "sessionEventsSubscribe"),
        ).toContainEqual({
            operation: "sessionEventsSubscribe",
            sessionId,
            after: "event-terminal-edge",
        });
        list.terminalCreate({ cols: 100, rows: 30 });
        await state.whenIdle();
        const terminalId = list.get().terminals[0]!.id;

        const controllers: FakeRigTerminalController[] = [];
        fake.terminalRoute((controller) => controllers.push(controller));
        const terminal = state.terminalOpen(sessionId, terminalId);
        await state.whenIdle();
        controllers[0]!.connected();
        terminal.terminalWrite("ls\n");
        terminal.terminalResize(120, 40);
        controllers[0]!.grid({
            cols: 120,
            cursor: { x: 0, y: 1, visible: true },
            palette: [],
            revision: 1,
            rows: [{ cells: [{ x: 0, text: "$", width: 1, styleId: 0 }], wrapped: false }],
            startRow: 0,
            styles: [],
            title: "shell",
            totalRows: 1,
        });
        expect(terminal.get()).toMatchObject({
            status: "connected",
            grid: { title: "shell", cols: 120 },
        });
        expect(controllers[0]!.writes).toEqual(["ls\n"]);
        expect(controllers[0]!.sizes).toEqual([{ cols: 120, rows: 40 }]);
        await expect(terminal.terminalScrollback(0, 100)).resolves.toMatchObject({
            historyEpoch: "epoch-1",
            count: 100,
        });

        controllers[0]!.error(new Error("socket dropped"));
        terminal.terminalReconnect();
        await state.whenIdle();
        expect(controllers).toHaveLength(2);
        expect(controllers[0]!.closed).toBe(true);
        terminal[Symbol.dispose]();
        expect(controllers[1]!.closed).toBe(true);
    });

    it("keeps stopped terminal history visible and cancels the list stream", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-stopped-terminal" as RigSessionId;
        const terminalId = "terminal-existing" as RigTerminalId;
        fake.sessionSet(fakeRigSession(sessionId));
        fake.terminalsSet(sessionId, [
            {
                id: terminalId,
                cols: 80,
                rows: 24,
                epoch: "epoch",
                status: "running",
                exitCode: null,
            },
        ]);
        using state = rigStateCreate({ transport: fake.transport });
        const list = state.terminalListOpen(sessionId);
        await state.whenIdle();
        list.terminalStop(terminalId);
        await state.whenIdle();
        expect(list.get().terminals[0]).toMatchObject({ status: "exited", exitCode: 0 });
        list[Symbol.dispose]();
        expect(fake.sessionSubscriberCount).toBe(0);
    });

    it("surfaces attach failures and closes an attachment that loses a stop race", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-terminal-race" as RigSessionId;
        const failedId = "terminal-failed" as RigTerminalId;
        const stoppedId = "terminal-stopped" as RigTerminalId;
        fake.sessionSet(fakeRigSession(sessionId));
        fake.terminalsSet(sessionId, [
            {
                id: failedId,
                cols: 80,
                rows: 24,
                epoch: "epoch-1",
                status: "running",
                exitCode: null,
            },
            {
                id: stoppedId,
                cols: 80,
                rows: 24,
                epoch: "epoch-2",
                status: "running",
                exitCode: null,
            },
        ]);
        using state = rigStateCreate({ transport: fake.transport });
        fake.failNext("terminalConnect", new Error("attach rejected"));
        using failed = state.terminalOpen(sessionId, failedId);
        await state.whenIdle();
        expect(failed.get()).toMatchObject({
            status: "error",
            error: { message: "attach rejected" },
        });

        let controller: FakeRigTerminalController | undefined;
        fake.terminalRoute((value) => (controller = value));
        const attachment = fake.deferNext("terminalConnect");
        using stopped = state.terminalOpen(sessionId, stoppedId);
        await vi.waitFor(() => expect(controller).toBeDefined());
        stopped.terminalStop();
        attachment.release();
        await state.whenIdle();
        expect(stopped.get()).toMatchObject({ status: "exited", exitCode: 0 });
        expect(controller!.closed).toBe(true);
    });

    it("does not reopen a terminal list stream released during reconnect reconciliation", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-released-terminals" as RigSessionId;
        fake.sessionSet(fakeRigSession(sessionId));
        using state = rigStateCreate({ transport: fake.transport });
        const list = state.terminalListOpen(sessionId);
        await state.whenIdle();
        const reconcile = fake.deferNext("terminalsRead");

        fake.sessionEnd(sessionId);
        list[Symbol.dispose]();
        reconcile.release();
        await state.whenIdle();

        expect(fake.sessionSubscriberCount).toBe(0);
    });
});
