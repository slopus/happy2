import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";
import type { ServerChildHandle } from "./serverChild";

const serverChildStart = vi.hoisted(() => vi.fn());
vi.mock("./serverChild", () => ({ serverChildStart }));

import { CredentialVault, type CredentialCipher } from "./credentialVault";
import { DesktopRuntime, type DesktopRuntimePaths } from "./desktopRuntime";

const directories: string[] = [];
const runtimes: DesktopRuntime[] = [];
const cipher: CredentialCipher = {
    available: () => true,
    decrypt: (value) => Buffer.from(value.toString("utf8"), "base64").toString("utf8"),
    encrypt: (value) => Buffer.from(Buffer.from(value).toString("base64")),
};

afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
    serverChildStart.mockReset();
});

describe("desktop topology lifetime", () => {
    it("starts and remembers one private local server with embedded account-free access", async () => {
        serverChildStart.mockImplementation(async () => serverHandle());
        const paths = await runtimePaths();
        const first = await runtimeCreate(paths);

        expect(first.get()).toMatchObject({ phase: "choosing", targets: [] });
        await first.start({ mode: "local" });
        const firstReady = readySnapshot(first.get());
        const topologyId = firstReady.activeTargetId;
        expect(topologyId).toMatch(/^top_[a-f0-9]{32}$/u);
        expect(firstReady).toMatchObject({
            activeTarget: {
                authentication: "local",
                id: topologyId,
                kind: "local",
                mode: "local",
            },
            mode: "local",
            targets: [{ id: topologyId, kind: "local", mode: "local" }],
        });

        const firstStart = serverChildStart.mock.calls[0]![0];
        expect(firstStart.start).toEqual({
            configPath: join(paths.root, "topologies", topologyId, "runtime", "happy2.toml"),
            errorLogPath: join(paths.root, "topologies", topologyId, "logs", "server-errors.log"),
            rigEndpointRoot: expect.stringMatching(/happy2-rig-/u),
            runtimeRoot: join(paths.root, "topologies", topologyId, "runtime"),
            webRoot: paths.webRoot,
        });
        expect(firstStart.localAccessToken).toMatch(/^[A-Za-z0-9_-]{64}$/u);
        await expect(stat(firstStart.start.rigEndpointRoot)).resolves.toBeDefined();
        expect(await first.sessionCredentialGet(topologyId)).toBe(firstStart.localAccessToken);
        await expect(first.sessionCredentialSet(topologyId, "replacement")).rejects.toThrow(
            "cannot be replaced",
        );
        await expect(readFile(join(paths.root, "credentials.json"), "utf8")).rejects.toMatchObject({
            code: "ENOENT",
        });
        expect(JSON.parse(await readFile(settingsPath(paths), "utf8"))).toEqual({
            version: 2,
            activeTopologyId: topologyId,
            topologies: [{ id: topologyId, mode: "local" }],
        });

        await first.close();
        await expect(stat(firstStart.start.rigEndpointRoot)).rejects.toMatchObject({
            code: "ENOENT",
        });
        runtimes.splice(runtimes.indexOf(first), 1);
        const second = await runtimeCreate(paths);
        expect(second.get()).toMatchObject({ phase: "starting", request: { mode: "local" } });
        const secondReady = await waitForReady(second);
        expect(secondReady.activeTargetId).toBe(topologyId);
        expect(serverChildStart.mock.calls[1]![0].start.runtimeRoot).toBe(
            join(paths.root, "topologies", topologyId, "runtime"),
        );
        expect(serverChildStart.mock.calls[1]![0].localAccessToken).not.toBe(
            firstStart.localAccessToken,
        );
    });

    it("shares one pending close task until child and endpoint cleanup complete", async () => {
        let releaseChild!: () => void;
        const childStopped = new Promise<void>((resolve) => {
            releaseChild = resolve;
        });
        const childClose = vi.fn(() => childStopped);
        const handle = { ...serverHandle(), close: childClose };
        serverChildStart.mockResolvedValue(handle);
        const paths = await runtimePaths();
        const runtime = await runtimeCreate(paths);
        await runtime.start({ mode: "local" });
        const endpointRoot = serverChildStart.mock.calls[0]![0].start.rigEndpointRoot;

        const firstClose = runtime.close();
        const secondClose = runtime.close();
        const firstSettled = vi.fn();
        const secondSettled = vi.fn();
        void firstClose.then(firstSettled);
        void secondClose.then(secondSettled);
        await vi.waitFor(() => expect(childClose).toHaveBeenCalledOnce());

        expect(firstClose).toBe(secondClose);
        expect(firstSettled).not.toHaveBeenCalled();
        expect(secondSettled).not.toHaveBeenCalled();
        await expect(stat(endpointRoot)).resolves.toBeDefined();

        releaseChild();
        await Promise.all([firstClose, secondClose]);

        expect(childClose).toHaveBeenCalledOnce();
        expect(firstSettled).toHaveBeenCalledOnce();
        expect(secondSettled).toHaveBeenCalledOnce();
        await expect(stat(endpointRoot)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("connects to cloud as a thin client without starting local processes", async () => {
        const paths = await runtimePaths();
        const runtime = await runtimeCreate(paths);

        await runtime.start({ mode: "cloud", serverUrl: "https://HAPPY.example.test/" });
        const ready = readySnapshot(runtime.get());
        expect(ready).toMatchObject({
            activeTarget: {
                authentication: "account",
                kind: "remote",
                mode: "cloud",
                serverUrl: "https://happy.example.test",
            },
            mode: "cloud",
        });
        expect(serverChildStart).not.toHaveBeenCalled();

        await runtime.sessionCredentialSet(ready.activeTargetId, "cloud-account-session");
        expect(await runtime.sessionCredentialGet(ready.activeTargetId)).toBe(
            "cloud-account-session",
        );
        const vaultSource = await readFile(join(paths.root, "credentials.json"), "utf8");
        expect(vaultSource).not.toContain("cloud-account-session");
    });

    it("preserves multiple topologies and switches between isolated local and cloud lifetimes", async () => {
        const localHandle = serverHandle();
        serverChildStart.mockImplementation(async () => localHandle);
        const paths = await runtimePaths();
        const runtime = await runtimeCreate(paths);

        await runtime.start({ mode: "local" });
        const localReady = readySnapshot(runtime.get());
        const localId = localReady.activeTargetId;
        const localConnectionId = localReady.connectionId;
        await runtime.reset();
        expect(runtime.get()).toMatchObject({
            phase: "choosing",
            targets: [{ id: localId, mode: "local" }],
        });

        await runtime.start({ mode: "cloud", serverUrl: "https://cloud.example.test" });
        const cloudReady = readySnapshot(runtime.get());
        const cloudId = cloudReady.activeTargetId;
        expect(cloudId).not.toBe(localId);
        expect(cloudReady.targets).toHaveLength(2);
        expect(localHandle.close).toHaveBeenCalledOnce();
        expect(serverChildStart).toHaveBeenCalledOnce();

        await runtime.topologySelect(localId);
        const selectedLocal = readySnapshot(runtime.get());
        expect(selectedLocal.activeTargetId).toBe(localId);
        expect(selectedLocal.connectionId).not.toBe(localConnectionId);
        expect(serverChildStart).toHaveBeenCalledTimes(2);
        expect(JSON.parse(await readFile(settingsPath(paths), "utf8"))).toEqual({
            version: 2,
            activeTopologyId: localId,
            topologies: [
                { id: localId, mode: "local" },
                { id: cloudId, mode: "cloud", serverUrl: "https://cloud.example.test" },
            ],
        });
    });

    it("remembers a new local topology only after startup retry succeeds", async () => {
        serverChildStart
            .mockRejectedValueOnce(new Error("transient startup failure"))
            .mockImplementationOnce(async () => serverHandle());
        const paths = await runtimePaths();
        const runtime = await runtimeCreate(paths);

        await expect(runtime.start({ mode: "local" })).rejects.toThrow("transient startup failure");
        expect(runtime.get()).toMatchObject({ phase: "error", request: { mode: "local" } });
        await expect(readFile(settingsPath(paths), "utf8")).rejects.toMatchObject({
            code: "ENOENT",
        });

        await runtime.retry();
        const ready = readySnapshot(runtime.get());
        expect(JSON.parse(await readFile(settingsPath(paths), "utf8"))).toEqual({
            version: 2,
            activeTopologyId: ready.activeTargetId,
            topologies: [{ id: ready.activeTargetId, mode: "local" }],
        });
    });

    it("ignores an exit callback from a local child after switching to cloud", async () => {
        serverChildStart.mockImplementation(async () => serverHandle());
        const paths = await runtimePaths();
        const runtime = await runtimeCreate(paths);

        await runtime.start({ mode: "local" });
        const staleExit = serverChildStart.mock.calls[0]![0].onUnexpectedExit;
        await runtime.reset();
        await runtime.start({ mode: "cloud", serverUrl: "https://cloud.example.test" });
        const cloudId = readySnapshot(runtime.get()).activeTargetId;

        staleExit(new Error("stale local exit"));
        expect(runtime.get()).toMatchObject({
            phase: "ready",
            activeTargetId: cloudId,
            mode: "cloud",
        });
    });

    it("changes connection identity when a failed local child is retried", async () => {
        serverChildStart.mockImplementation(async () => serverHandle());
        const paths = await runtimePaths();
        const runtime = await runtimeCreate(paths);

        await runtime.start({ mode: "local" });
        const first = readySnapshot(runtime.get());
        serverChildStart.mock.calls[0]![0].onUnexpectedExit(new Error("local exit"));
        expect(runtime.get()).toMatchObject({ phase: "error" });

        await runtime.retry();
        const restarted = readySnapshot(runtime.get());
        expect(restarted.activeTargetId).toBe(first.activeTargetId);
        expect(restarted.connectionId).not.toBe(first.connectionId);
    });
});

async function runtimePaths(): Promise<DesktopRuntimePaths> {
    const root = await mkdtemp(join(tmpdir(), "happy2-desktop-runtime-"));
    directories.push(root);
    return {
        executablePath: "/Applications/Happy.app/Contents/MacOS/Happy",
        root,
        serverWorkerPath: join(root, "server-process.js"),
        webRoot: join(root, "renderer"),
    };
}

async function runtimeCreate(paths: DesktopRuntimePaths): Promise<DesktopRuntime> {
    const runtime = await DesktopRuntime.create(
        paths,
        new CredentialVault(join(paths.root, "credentials.json"), cipher),
    );
    runtimes.push(runtime);
    return runtime;
}

function settingsPath(paths: DesktopRuntimePaths): string {
    return join(paths.root, "desktop-settings.json");
}

function serverHandle(): ServerChildHandle {
    return {
        child: {} as ServerChildHandle["child"],
        close: vi.fn(async () => undefined),
        url: "http://127.0.0.1:41000",
    };
}

function readySnapshot(snapshot: DesktopRuntimeSnapshot) {
    if (snapshot.phase !== "ready") throw new Error(`Expected ready, received ${snapshot.phase}.`);
    return snapshot;
}

async function waitForReady(runtime: DesktopRuntime) {
    const current = runtime.get();
    if (current.phase === "ready") return current;
    return await new Promise<Extract<DesktopRuntimeSnapshot, { phase: "ready" }>>(
        (resolve, reject) => {
            const timeout = setTimeout(() => {
                close();
                reject(new Error("Desktop runtime did not become ready."));
            }, 5_000);
            const close = runtime.subscribe((snapshot) => {
                if (snapshot.phase !== "ready") return;
                clearTimeout(timeout);
                close();
                resolve(snapshot);
            });
        },
    );
}
