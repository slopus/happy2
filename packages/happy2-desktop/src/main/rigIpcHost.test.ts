import { describe, expect, it, vi } from "vitest";
import type { RigSessionId, RigTerminalId } from "happy2-state";
import {
    createFakeRigTransport,
    fakeRigSession,
    type FakeRigTerminalController,
} from "happy2-state/testing";
import { RigIpcHost } from "./rigIpcHost";
import { rigClientRequestValidate, rigStreamOpenRequestValidate } from "./rigIpcValidation";

describe("Rig IPC authorization and cleanup", () => {
    it("validates closed request trees and rejects shell, credential, and extra fields", () => {
        expect(
            rigClientRequestValidate({
                type: "sessionCreate",
                input: {
                    cwd: "/workspace",
                    modelId: "gpt",
                    permissionMode: "auto",
                },
            }),
        ).toMatchObject({ type: "sessionCreate", input: { cwd: "/workspace" } });
        expect(() =>
            rigClientRequestValidate({
                type: "sessionCreate",
                input: { cwd: "/workspace", token: "secret" },
            }),
        ).toThrow("unsupported fields");
        expect(() =>
            rigClientRequestValidate({ type: "runShell", command: "rm -rf /tmp/example" }),
        ).toThrow("unsupported");
        expect(() =>
            rigClientRequestValidate({
                type: "messageSubmit",
                sessionId: "session",
                text: "hello",
                clientSubmissionId: "submission",
                expectedRunId: "unexpected",
            }),
        ).toThrow("unsupported fields");
        expect(() =>
            rigStreamOpenRequestValidate({
                type: "terminal",
                sessionId: "session",
                terminalId: "terminal",
                socketPath: "/tmp/rig.sock",
            }),
        ).toThrow("unsupported fields");
    });

    it("binds subscriptions and terminals to their renderer and cleans up on disposal", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-ipc" as RigSessionId;
        const terminalId = "terminal-ipc" as RigTerminalId;
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
        let terminal: FakeRigTerminalController | undefined;
        fake.terminalRoute((controller) => (terminal = controller));
        using host = new RigIpcHost(() => fake.transport);
        const events: string[] = [];
        const global = await host.streamOpen(10, { type: "globalEvents" }, ({ type }) =>
            events.push(type),
        );
        const attached = await host.streamOpen(
            10,
            { type: "terminal", sessionId, terminalId },
            ({ type }) => events.push(type),
        );
        expect(fake.globalSubscriberCount).toBe(1);
        expect(() => host.streamClose(11, global)).toThrow("unavailable");

        terminal!.connected();
        host.terminalWrite(10, attached, "pwd\n");
        host.terminalResize(10, attached, 100, 30);
        expect(terminal!.writes).toEqual(["pwd\n"]);
        expect(terminal!.sizes).toEqual([{ cols: 100, rows: 30 }]);
        expect(events).toContain("terminalConnected");

        host.closeOwner(10);
        expect(fake.globalSubscriberCount).toBe(0);
        expect(terminal!.closed).toBe(true);
    });

    it("closes a terminal that finishes attaching after its renderer owner is gone", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-racing-owner" as RigSessionId;
        const terminalId = "terminal-racing-owner" as RigTerminalId;
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
        const attach = fake.deferNext("terminalConnect");
        let terminal: FakeRigTerminalController | undefined;
        fake.terminalRoute((controller) => (terminal = controller));
        using host = new RigIpcHost(() => fake.transport);

        const opening = host.streamOpen(
            10,
            { type: "terminal", sessionId, terminalId },
            () => undefined,
        );
        host.closeOwner(10);
        attach.release();

        await expect(opening).rejects.toThrow("owner closed");
        expect(terminal!.closed).toBe(true);
    });

    it("reports request transport failures to the runtime recovery boundary", async () => {
        const fake = createFakeRigTransport();
        fake.failNext(
            "sessionsRead",
            Object.assign(new Error("socket refused"), {
                code: "ECONNREFUSED",
            }),
        );
        const unavailable = vi.fn();
        using host = new RigIpcHost(() => fake.transport, unavailable);

        await expect(host.request({ type: "sessionsRead" })).rejects.toThrow("socket refused");
        expect(unavailable).toHaveBeenCalledOnce();
        expect(unavailable.mock.calls[0]?.[0]).toMatchObject({ code: "ECONNREFUSED" });
    });
});
