import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    execFile: vi.fn(),
    request: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:child_process")>()),
    execFile: mocks.execFile,
}));
vi.mock("node:http", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:http")>()),
    request: mocks.request,
}));

import { RigDaemonClient, type RigDaemonConfig } from "./daemon.js";

describe("Rig daemon ownership", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.execFile.mockImplementation((...arguments_: unknown[]) => {
            const callback = arguments_.at(-1) as (error: Error | null) => void;
            callback(null);
        });
    });

    it("stops a managed daemon once when startup failed before writing a token", async () => {
        const client = new RigDaemonClient(config("managed"));

        await Promise.all([client.close(), client.close()]);
        await client.close();

        expect(mocks.execFile).toHaveBeenCalledTimes(1);
        expect(mocks.execFile).toHaveBeenCalledWith(
            "/opt/rig",
            ["daemon", "stop"],
            {
                env: expect.objectContaining({
                    RIG_DISABLE_HAPPY_SYNC: "1",
                    RIG_HOME: "/private/rig",
                    RIG_SERVER_DIRECTORY: "",
                    RIG_SERVER_SOCKET_PATH: "/private/rig/server.sock",
                    RIG_SERVER_TOKEN_PATH: "/private/rig/token",
                }),
            },
            expect.any(Function),
        );
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it("issues the stop command before checking degraded managed daemon health", async () => {
        const events: string[] = [];
        mocks.execFile.mockImplementation((...arguments_: unknown[]) => {
            events.push("stop");
            const callback = arguments_.at(-1) as (error: Error | null) => void;
            callback(null);
        });
        respondWithHealth("degraded", events);
        const client = new RigDaemonClient(config("managed"));
        Reflect.set(client, "token", "existing-token");

        await client.close();

        expect(events).toEqual(["stop", "health"]);
    });

    it("waits for an in-flight daemon reload before stopping", async () => {
        let rejectReload!: (error: Error) => void;
        const reload = new Promise<void>((_resolve, reject) => {
            rejectReload = reject;
        });
        const client = new RigDaemonClient(config("managed"));
        Reflect.set(client, "daemonReload", reload);

        const closing = client.close();
        await Promise.resolve();
        expect(mocks.execFile).not.toHaveBeenCalled();

        rejectReload(new Error("reload failed"));
        await closing;

        expect(mocks.execFile).toHaveBeenCalledTimes(1);
        expect(mocks.execFile).toHaveBeenCalledWith(
            "/opt/rig",
            ["daemon", "stop"],
            expect.any(Object),
            expect.any(Function),
        );
    });

    it("fences an ordinary connect paused before start and stops only after it settles", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-rig-close-"));
        const events: string[] = [];
        let allowStart!: () => void;
        let reachedStart!: () => void;
        const startAllowed = new Promise<void>((resolve) => {
            allowStart = resolve;
        });
        const startReached = new Promise<void>((resolve) => {
            reachedStart = resolve;
        });
        mocks.execFile.mockImplementation((...arguments_: unknown[]) => {
            const daemonAction = (arguments_[1] as string[])[1];
            events.push(daemonAction ?? "unknown");
            const callback = arguments_.at(-1) as (error: Error | null) => void;
            callback(daemonAction === "start" ? new Error("unexpected late start") : null);
        });
        const client = new RigDaemonClient({
            ...config("managed"),
            directory: join(root, "rig"),
            socketPath: join(root, "endpoint", "server.sock"),
            tokenPath: join(root, "endpoint", "token"),
        });
        const startDaemon = Reflect.get(client, "startDaemon") as () => Promise<void>;
        Reflect.set(client, "startDaemon", async () => {
            reachedStart();
            await startAllowed;
            await startDaemon.call(client);
        });

        try {
            const connecting = client.modelCatalog();
            await startReached;

            const firstClose = client.close();
            const secondClose = client.close();
            await Promise.resolve();

            expect(firstClose).toBe(secondClose);
            expect(events).toEqual([]);

            allowStart();
            await expect(connecting).rejects.toThrow("server is shutting down");
            await firstClose;

            expect(events).toEqual(["stop"]);
        } finally {
            allowStart();
            await client.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    it("never stops an attached daemon", async () => {
        const client = new RigDaemonClient(config("attached"));

        await Promise.all([client.close(), client.close()]);

        expect(mocks.execFile).not.toHaveBeenCalled();
        expect(mocks.request).not.toHaveBeenCalled();
    });
});

function config(daemonMode: RigDaemonConfig["daemonMode"]): RigDaemonConfig {
    return {
        daemonMode,
        directory: "/private/rig",
        socketPath: "/private/rig/server.sock",
        tokenPath: "/private/rig/token",
        command: "/opt/rig",
    };
}

function respondWithHealth(status: "degraded" | "ready", events: string[]): void {
    mocks.request.mockImplementation((...arguments_: unknown[]) => {
        const onResponse = arguments_.at(-1) as (response: EventEmitter) => void;
        const request = Object.assign(new EventEmitter(), {
            destroy: vi.fn(),
            end: vi.fn(),
            setTimeout: vi.fn(),
            write: vi.fn(),
        });
        request.end.mockImplementation(() => {
            events.push("health");
            const response = Object.assign(new EventEmitter(), { statusCode: 200 });
            onResponse(response);
            response.emit(
                "data",
                Buffer.from(JSON.stringify({ identity: { version: "0.0.33" }, status })),
            );
            response.emit("end");
            request.emit("close");
        });
        return request;
    });
}
