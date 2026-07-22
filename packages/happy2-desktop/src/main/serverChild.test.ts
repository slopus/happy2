import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { ServerProcessInput, ServerProcessStart } from "../shared/serverProcessContract";
import { serverChildWaitForReady } from "./serverChild";

class StuckChild extends EventEmitter {
    exitCode: number | null = null;
    signalCode: NodeJS.Signals | null = null;
    readonly messages: ServerProcessInput[] = [];
    readonly signals: NodeJS.Signals[] = [];

    send(message: ServerProcessInput): boolean {
        this.messages.push(message);
        return true;
    }

    kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
        this.signals.push(signal);
        if (signal === "SIGKILL") {
            this.signalCode = signal;
            this.emit("exit", null, signal);
        }
        return true;
    }
}

describe("desktop server child startup", () => {
    it("waits for bounded worker termination before rejecting a startup timeout", async () => {
        const child = new StuckChild();
        const log = { closed: false, end: vi.fn() };
        const startup = serverChildWaitForReady(
            child as unknown as ChildProcess,
            serverStart,
            log,
            1,
            1,
        );

        await expect(startup).rejects.toThrow("timed out");
        expect(child.messages).toEqual([
            { type: "start", input: serverStart },
            { type: "shutdown" },
        ]);
        expect(child.signals).toEqual(["SIGKILL"]);
        expect(log.end).toHaveBeenCalledOnce();
    });
});

const serverStart: ServerProcessStart = {
    configPath: "/private/happy2.toml",
    errorLogPath: "/private/server-errors.log",
    rigEndpointRoot: "/private/rig-endpoint",
    runtimeRoot: "/private/runtime",
    webRoot: "/private/web",
};
