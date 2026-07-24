import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProtocolHttpClient } from "@slopus/rig-client-runtime/dist/client/index.js";
import type { RigTransport } from "happy2-state";
import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";
import {
    RigCommandMissingError,
    type LocalRigConnection,
    type LocalRigConnector,
} from "./localRig";
import { DesktopRuntime, type DesktopRuntimePaths } from "./desktopRuntime";

const directories: string[] = [];
const runtimes: DesktopRuntime[] = [];

afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
});

describe("desktop direct Rig topology", () => {
    it("connects to the normal daemon and leaves daemon ownership outside Happy", async () => {
        const close = vi.fn();
        const connector = connectorSequence([connection(close)]);
        const transportDispose = vi.fn();
        const runtime = await runtimeCreate(connector, transportDispose);

        await runtime.start({ mode: "local" });

        expect(readySnapshot(runtime.get())).toMatchObject({
            activeTarget: {
                authentication: "rig",
                kind: "local",
                label: "This Mac",
                mode: "local",
                rigVersion: "0.0.45",
            },
            mode: "local",
        });
        expect(runtime.localRigTransport()).toBeDefined();
        await runtime.close();
        expect(transportDispose).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
    });

    it("publishes install-required without persisting a failed local activation", async () => {
        const connector = connectorSequence([new RigCommandMissingError()]);
        const { runtime, paths } = await runtimeCreateWithPaths(connector);

        await runtime.start({ mode: "local" });

        expect(runtime.get()).toMatchObject({
            phase: "installRequired",
            command: "npm install --global @slopus/rig",
            request: { mode: "local" },
        });
        await expect(
            readFile(join(paths.root, "desktop-settings.json"), "utf8"),
        ).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("retries discovery after installation and then persists the local choice", async () => {
        const connector = connectorSequence([new RigCommandMissingError(), connection(vi.fn())]);
        const { runtime, paths } = await runtimeCreateWithPaths(connector);
        await runtime.start({ mode: "local" });
        expect(runtime.get().phase).toBe("installRequired");

        await runtime.retry();

        expect(runtime.get()).toMatchObject({ phase: "ready", mode: "local" });
        expect(
            JSON.parse(await readFile(join(paths.root, "desktop-settings.json"), "utf8")),
        ).toMatchObject({
            version: 2,
            topologies: [{ mode: "local" }],
        });
    });

    it("keeps an ordinary daemon-start failure retryable without persisting it", async () => {
        const connector = connectorSequence([
            new Error("daemon start failed"),
            connection(vi.fn()),
        ]);
        const { runtime, paths } = await runtimeCreateWithPaths(connector);

        await expect(runtime.start({ mode: "local" })).rejects.toThrow("daemon start failed");
        expect(runtime.get()).toMatchObject({
            phase: "error",
            retryable: true,
            message: "daemon start failed",
        });
        await expect(
            readFile(join(paths.root, "desktop-settings.json"), "utf8"),
        ).rejects.toMatchObject({ code: "ENOENT" });

        await runtime.retry();
        expect(runtime.get()).toMatchObject({ phase: "ready", mode: "local" });
    });

    it("keeps cloud topology behavior independent from local Rig discovery", async () => {
        const connector: LocalRigConnector = { connect: vi.fn() };
        const runtime = await runtimeCreate(connector);

        await runtime.start({ mode: "cloud", serverUrl: "https://happy.example" });

        expect(readySnapshot(runtime.get())).toMatchObject({
            activeTarget: {
                authentication: "account",
                mode: "cloud",
                serverUrl: "https://happy.example",
            },
            mode: "cloud",
        });
        expect(connector.connect).not.toHaveBeenCalled();
        expect(() => runtime.localRigTransport()).toThrow("not active");
    });

    it("disposes local streams while switching topology without stopping the daemon", async () => {
        const connectionClose = vi.fn();
        const connector = connectorSequence([connection(connectionClose)]);
        const transportDispose = vi.fn();
        const runtime = await runtimeCreate(connector, transportDispose);
        await runtime.start({ mode: "local" });

        await runtime.start({ mode: "cloud", serverUrl: "https://happy.example" });

        expect(transportDispose).toHaveBeenCalledOnce();
        expect(connectionClose).toHaveBeenCalledOnce();
        expect(runtime.get()).toMatchObject({ phase: "ready", mode: "cloud" });
    });

    it("restores the persisted topology through the same connector after restart", async () => {
        const connector = connectorSequence([connection(vi.fn()), connection(vi.fn())]);
        const { runtime: first, paths } = await runtimeCreateWithPaths(connector);
        await first.start({ mode: "local" });
        await first.close();

        const second = await DesktopRuntime.create(paths, {
            localRigConnector: connector,
            transportCreate: transportStub,
        });
        runtimes.push(second);
        await waitFor(() => second.get().phase === "ready");
        expect(second.get()).toMatchObject({ phase: "ready", mode: "local" });
    });
});

function connectorSequence(values: readonly (LocalRigConnection | Error)[]): LocalRigConnector {
    const remaining = [...values];
    return {
        connect: vi.fn(async () => {
            const value = remaining.shift();
            if (!value) throw new Error("No fake Rig connection remains.");
            if (value instanceof Error) throw value;
            return value;
        }),
    };
}

function connection(close: () => void): LocalRigConnection {
    return {
        client: {} as ProtocolHttpClient,
        command: "/usr/local/bin/rig",
        environment: { PATH: "/usr/local/bin:/usr/bin" },
        version: "0.0.45",
        close,
    };
}

function transportStub(): RigTransport & Disposable {
    return { [Symbol.dispose]: vi.fn() } as unknown as RigTransport & Disposable;
}

async function runtimeCreate(
    connector: LocalRigConnector,
    dispose?: () => void,
): Promise<DesktopRuntime> {
    return (await runtimeCreateWithPaths(connector, dispose)).runtime;
}

async function runtimeCreateWithPaths(
    connector: LocalRigConnector,
    dispose?: () => void,
): Promise<{ readonly runtime: DesktopRuntime; readonly paths: DesktopRuntimePaths }> {
    const root = await mkdtemp(join(tmpdir(), "happy2-desktop-runtime-"));
    directories.push(root);
    const paths = { root };
    const runtime = await DesktopRuntime.create(paths, {
        localRigConnector: connector,
        transportCreate: () =>
            ({ [Symbol.dispose]: dispose ?? vi.fn() }) as unknown as RigTransport & Disposable,
    });
    runtimes.push(runtime);
    return { runtime, paths };
}

function readySnapshot(
    snapshot: DesktopRuntimeSnapshot,
): Extract<DesktopRuntimeSnapshot, { readonly phase: "ready" }> {
    if (snapshot.phase !== "ready") throw new Error("Expected ready desktop runtime.");
    return snapshot;
}

async function waitFor(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for desktop runtime.");
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
}
