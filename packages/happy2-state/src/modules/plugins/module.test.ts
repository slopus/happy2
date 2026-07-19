import { describe, expect, it, vi } from "vitest";
import type { SystemPluginSummary } from "../../resources.js";
import { createFakeServer, jsonResponse, type FakeStreamController } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    pluginsLoad,
    pluginsOutputRoute,
    pluginsStoreCreate,
    type PluginsStore,
} from "./pluginsState.js";

const catalogItem = {
    displayName: "Hello",
    shortName: "hello",
    description: "A minimal skills-only plugin.",
    version: "1.0.0",
    packageDigest: "digest-1",
    grantedPermissions: [],
    skills: [{ name: "hello", description: "Says hello.", directory: "hello" }],
    variables: [],
};

const installation = {
    id: "installation-1",
    pluginId: "plugin-1",
    shortName: "hello",
    sourceVersion: "1.0.0",
    packageDigest: "digest-1",
    status: "ready",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    readyAt: "2026-01-01T00:00:00.000Z",
};

function systemPlugin(overrides: Partial<SystemPluginSummary> = {}): SystemPluginSummary {
    return {
        id: "plugin-1",
        displayName: "Linked Tools",
        shortName: "linked-tools",
        description: "Tools linked from a ZIP URL.",
        sourceKind: "zip_url",
        sourceReference: "https://example.com/plugin.zip",
        sourceVersion: "1.0.0",
        packageDigest: "digest-1",
        variables: [],
        apiPermissions: [],
        image: {
            contentType: "image/png",
            size: 10,
            width: 1024,
            height: 1024,
            thumbhash: "hash",
            checksumSha256: "checksum",
        },
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updateAvailable: false,
        installations: [],
        ...overrides,
    };
}

function surfaceCreate(runtime: StateRuntime): {
    binding: PluginsStore;
    routed: Promise<void>[];
} {
    let binding!: PluginsStore;
    const routed: Promise<void>[] = [];
    binding = pluginsStoreCreate((event) =>
        routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
    );
    return { binding, routed };
}

describe("plugins module", () => {
    it("loads the catalog, installs with variables, and reconciles the durable catalog", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/plugins",
            jsonResponse(200, { plugins: [catalogItem] }),
            jsonResponse(200, {
                plugins: [
                    {
                        ...catalogItem,
                        systemPlugin: {
                            id: "plugin-1",
                            displayName: "Hello",
                            shortName: "hello",
                            description: "A minimal skills-only plugin.",
                            sourceVersion: "1.0.0",
                            packageDigest: "digest-1",
                            variables: [],
                            image: {
                                contentType: "image/png",
                                size: 10,
                                width: 1024,
                                height: 1024,
                                thumbhash: "hash",
                                checksumSha256: "checksum",
                            },
                            installedAt: "2026-01-01T00:00:00.000Z",
                            updatedAt: "2026-01-01T00:00:00.000Z",
                            updateAvailable: false,
                            installations: [installation],
                        },
                    },
                ],
            }),
        );
        server.respond(
            "POST",
            "/v0/admin/plugins/hello/installPlugin",
            jsonResponse(202, { installation }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof pluginsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = pluginsStoreCreate((event) =>
            routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
        );
        await pluginsLoad({ runtime, plugins: binding });
        expect(binding.getState().catalog).toMatchObject({
            type: "ready",
            value: [{ shortName: "hello" }],
        });
        // A realtime-hinted reconcile re-runs the load; the ready catalog must
        // stay on screen instead of flashing back to a loading state.
        binding.getState().pluginsInput({ type: "pluginsLoading" });
        expect(binding.getState().catalog.type).toBe("ready");
        binding.getState().pluginInstall("hello", { API_TOKEN: "secret value" }, []);
        expect(binding.getState().installing).toEqual(["hello"]);
        await Promise.all(routed);
        const snapshot = binding.getState();
        expect(snapshot.installing).toEqual([]);
        expect(snapshot.catalog).toMatchObject({
            type: "ready",
            value: [{ systemPlugin: { installations: [{ id: "installation-1" }] } }],
        });
        const install = server.requests.find((request) => request.method === "POST");
        expect(install?.path).toBe("/v0/admin/plugins/hello/installPlugin");
        expect(install?.body).toEqual({ variables: { API_TOKEN: "secret value" } });
        expect(JSON.stringify(snapshot)).not.toContain("secret value");
        runtime.stop();
    });

    it("sends an empty body when the manifest declares no variables", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [catalogItem] }));
        server.respond(
            "POST",
            "/v0/admin/plugins/hello/installPlugin",
            jsonResponse(202, { installation }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof pluginsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = pluginsStoreCreate((event) =>
            routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
        );
        binding.getState().pluginInstall("hello", {}, []);
        await Promise.all(routed);
        const install = server.requests.find((request) => request.method === "POST");
        expect(install?.body).toEqual({});
        runtime.stop();
    });

    it("sends the granted permission subset with the install request", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [catalogItem] }));
        server.respond(
            "POST",
            "/v0/admin/plugins/hello/installPlugin",
            jsonResponse(202, { installation }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof pluginsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = pluginsStoreCreate((event) =>
            routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
        );
        binding.getState().pluginInstall("hello", {}, ["plugins:list", "plugins:install"]);
        await Promise.all(routed);
        const install = server.requests.find((request) => request.method === "POST");
        expect(install?.body).toEqual({ permissions: ["plugins:list", "plugins:install"] });
        runtime.stop();
    });

    it("replaces one installation grant set and reconciles the durable catalog", async () => {
        const granted = { ...installation, grantedPermissions: ["plugins:list"] };
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/plugins",
            jsonResponse(200, {
                plugins: [
                    {
                        ...catalogItem,
                        systemPlugin: {
                            id: "plugin-1",
                            displayName: "Hello",
                            shortName: "hello",
                            description: "A minimal skills-only plugin.",
                            sourceVersion: "1.0.0",
                            packageDigest: "digest-1",
                            variables: [],
                            image: {
                                contentType: "image/png",
                                size: 10,
                                width: 1024,
                                height: 1024,
                                thumbhash: "hash",
                                checksumSha256: "checksum",
                            },
                            installedAt: "2026-01-01T00:00:00.000Z",
                            updatedAt: "2026-01-01T00:00:00.000Z",
                            updateAvailable: false,
                            installations: [granted],
                        },
                    },
                ],
            }),
        );
        server.respond(
            "POST",
            "/v0/admin/pluginInstallations/installation-1/updatePermissions",
            jsonResponse(202, { installation: granted }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof pluginsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = pluginsStoreCreate((event) =>
            routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
        );
        await pluginsLoad({ runtime, plugins: binding });
        binding.getState().pluginPermissionsUpdate("installation-1", ["plugins:list"]);
        expect(binding.getState().updatingPermissions).toEqual(["installation-1"]);
        await Promise.all(routed);
        const snapshot = binding.getState();
        expect(snapshot.updatingPermissions).toEqual([]);
        expect(snapshot.catalog).toMatchObject({
            type: "ready",
            value: [
                {
                    systemPlugin: {
                        installations: [
                            { id: "installation-1", grantedPermissions: ["plugins:list"] },
                        ],
                    },
                },
            ],
        });
        const update = server.requests.find((request) => request.method === "POST");
        expect(update?.path).toBe("/v0/admin/pluginInstallations/installation-1/updatePermissions");
        expect(update?.body).toEqual({ permissions: ["plugins:list"] });
        runtime.stop();
    });

    it("surfaces a failed permission update and clears the pending installation flag", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/admin/pluginInstallations/installation-1/updatePermissions",
            jsonResponse(403, { error: "forbidden", message: "Only administrators may do that." }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof pluginsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = pluginsStoreCreate((event) =>
            routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
        );
        binding.getState().pluginPermissionsUpdate("installation-1", []);
        await Promise.all(routed);
        expect(binding.getState().updatingPermissions).toEqual([]);
        expect(binding.getState().actionError?.message).toBe("Only administrators may do that.");
        runtime.stop();
    });

    it("surfaces a failed install as a displayable action error and clears the pending flag", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [catalogItem] }));
        server.respond(
            "POST",
            "/v0/admin/plugins/hello/installPlugin",
            jsonResponse(400, {
                error: "broken_configuration",
                message: "PROJECT_API_TOKEN is required.",
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof pluginsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = pluginsStoreCreate((event) =>
            routed.push(pluginsOutputRoute({ runtime, plugins: binding }, event)),
        );
        await pluginsLoad({ runtime, plugins: binding });
        binding.getState().pluginInstall("hello", {}, []);
        await Promise.all(routed);
        expect(binding.getState().installing).toEqual([]);
        expect(binding.getState().actionError?.message).toBe("PROJECT_API_TOKEN is required.");
        runtime.stop();
    });

    it("clears a previous action error before the next typed intent", () => {
        const output = vi.fn();
        const binding = pluginsStoreCreate(output);
        binding.getState().pluginsInput({
            type: "pluginInstallFailed",
            shortName: "hello",
            error: new Error("bad") as never,
        });
        binding.getState().pluginInstall("hello", {}, []);
        expect(binding.getState().actionError).toBeUndefined();
        expect(output).toHaveBeenCalledWith({
            type: "pluginInstallSubmitted",
            shortName: "hello",
            variables: {},
            permissions: [],
        });
    });

    it("loads persisted system plugins alongside the catalog and uninstalls one durably", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, { plugins: [systemPlugin()] }),
            jsonResponse(200, { plugins: [] }),
        );
        server.respond(
            "POST",
            "/v0/admin/systemPlugins/plugin-1/uninstallPlugin",
            jsonResponse(200, {
                uninstalled: { pluginId: "plugin-1", installationIds: ["installation-1"] },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = surfaceCreate(runtime);
        await pluginsLoad({ runtime, plugins: binding });
        expect(binding.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ id: "plugin-1", sourceKind: "zip_url" }],
        });
        // A realtime-hinted reconcile must not blank an already-ready list.
        binding.getState().pluginsInput({ type: "systemPluginsLoading" });
        expect(binding.getState().systemPlugins.type).toBe("ready");
        binding.getState().pluginUninstall("plugin-1");
        expect(binding.getState().uninstalling).toEqual(["plugin-1"]);
        // Submitting the same uninstall twice keeps one in-flight request.
        binding.getState().pluginUninstall("plugin-1");
        await Promise.all(routed);
        const uninstall = server.requests.find((request) =>
            request.path.endsWith("/uninstallPlugin"),
        );
        expect(uninstall?.body).toEqual({});
        expect(
            server.requests.filter((request) => request.path.endsWith("/uninstallPlugin")),
        ).toHaveLength(1);
        expect(binding.getState().uninstalling).toEqual([]);
        expect(binding.getState().systemPlugins).toEqual({ type: "ready", value: [] });
        runtime.stop();
    });

    it("surfaces a failed uninstall as a displayable action error and clears the pending flag", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, { plugins: [systemPlugin()] }),
        );
        server.respond(
            "POST",
            "/v0/admin/systemPlugins/plugin-1/uninstallPlugin",
            jsonResponse(404, { error: "not_found", message: "System plugin was not found" }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = surfaceCreate(runtime);
        await pluginsLoad({ runtime, plugins: binding });
        binding.getState().pluginUninstall("plugin-1");
        await Promise.all(routed);
        expect(binding.getState().uninstalling).toEqual([]);
        expect(binding.getState().actionError?.message).toBe("System plugin was not found");
        expect(binding.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ id: "plugin-1" }],
        });
        runtime.stop();
    });

    it("automatically checks eligible plugins while watched and cancels when unwatched", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, {
                plugins: [
                    systemPlugin(),
                    systemPlugin({
                        id: "plugin-2",
                        shortName: "uploaded-tools",
                        sourceKind: "upload",
                        sourceReference: "upload:sha256:abc",
                    }),
                    systemPlugin({
                        id: "plugin-3",
                        shortName: "repo-tools",
                        sourceKind: "github",
                        sourceReference: "github:ref",
                        packageDigest: "digest-3",
                    }),
                ],
            }),
        );
        const streams = new Map<string, FakeStreamController>();
        server.streamRoute(
            "POST",
            /^\/v0\/admin\/systemPlugins\/[^/]+\/checkForUpdate$/,
            (request, stream) => {
                streams.set(request.path.split("/")[4]!, stream);
            },
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = surfaceCreate(runtime);
        await pluginsLoad({ runtime, plugins: binding });
        binding.getState().updateChecksStart();
        // Uploaded packages have no remote source and are never checked.
        expect([...streams.keys()].sort()).toEqual(["plugin-1", "plugin-3"]);
        expect(binding.getState().updateChecks.get("plugin-2")).toBeUndefined();
        expect(binding.getState().updateChecks.get("plugin-1")).toEqual({ status: "checking" });
        streams.get("plugin-1")!.event("progress", {
            stage: "downloading",
            detail: "Downloading package",
            receivedBytes: 5,
            totalBytes: 10,
        });
        expect(binding.getState().updateChecks.get("plugin-1")).toMatchObject({
            status: "checking",
            progress: { stage: "downloading", receivedBytes: 5 },
        });
        streams.get("plugin-1")!.event("checked", {
            update: {
                pluginId: "plugin-1",
                checkedAt: "2026-01-02T00:00:00.000Z",
                updateAvailable: true,
                installed: { version: "1.0.0", packageDigest: "digest-1" },
                remote: { version: "1.1.0", packageDigest: "digest-9" },
            },
        });
        expect(binding.getState().updateChecks.get("plugin-1")).toMatchObject({
            status: "checked",
            update: { updateAvailable: true, remote: { version: "1.1.0" } },
        });
        // Leaving the surface aborts the still-open stream.
        const firstRepoStream = streams.get("plugin-3")!;
        binding.getState().updateChecksStop();
        expect(firstRepoStream.aborted).toBe(true);
        expect(binding.getState().updateChecks.get("plugin-3")).toBeUndefined();
        // Returning while the previous check was unfinished opens a fresh
        // stream instead of leaving a permanent orphaned "checking" state.
        binding.getState().updateChecksStart();
        const restartedRepoStream = streams.get("plugin-3")!;
        expect(restartedRepoStream).not.toBe(firstRepoStream);
        expect(restartedRepoStream.aborted).toBe(false);
        binding.getState().updateChecksStop();
        expect(restartedRepoStream.aborted).toBe(true);
        await Promise.all(routed);
        runtime.stop();
    });

    it("keeps completed results across re-watching and re-checks only changed digests", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, { plugins: [systemPlugin()] }),
            jsonResponse(200, { plugins: [systemPlugin({ packageDigest: "digest-2" })] }),
        );
        server.respondStream(
            "POST",
            /^\/v0\/admin\/systemPlugins\/[^/]+\/checkForUpdate$/,
            [
                {
                    event: "checked",
                    data: {
                        update: {
                            pluginId: "plugin-1",
                            checkedAt: "2026-01-02T00:00:00.000Z",
                            updateAvailable: true,
                            installed: { version: "1.0.0", packageDigest: "digest-1" },
                            remote: { version: "1.1.0", packageDigest: "digest-2" },
                        },
                    },
                },
            ],
            [
                {
                    event: "checked",
                    data: {
                        update: {
                            pluginId: "plugin-1",
                            checkedAt: "2026-01-03T00:00:00.000Z",
                            updateAvailable: false,
                            installed: { version: "1.1.0", packageDigest: "digest-2" },
                            remote: { version: "1.1.0", packageDigest: "digest-2" },
                        },
                    },
                },
            ],
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = surfaceCreate(runtime);
        await pluginsLoad({ runtime, plugins: binding });
        binding.getState().updateChecksStart();
        await Promise.all(routed);
        const checkRequests = () =>
            server.requests.filter((request) => request.path.endsWith("/checkForUpdate")).length;
        expect(checkRequests()).toBe(1);
        // Re-watching with an unchanged digest reuses the completed result.
        binding.getState().updateChecksStop();
        binding.getState().updateChecksStart();
        await Promise.all(routed);
        expect(checkRequests()).toBe(1);
        // A reconciled digest change re-checks the same plugin while watched.
        await pluginsLoad({ runtime, plugins: binding });
        await runtime.whenIdle();
        await Promise.all(routed);
        expect(checkRequests()).toBe(2);
        expect(binding.getState().updateChecks.get("plugin-1")).toMatchObject({
            status: "checked",
            update: { updateAvailable: false },
        });
        runtime.stop();
    });

    it("a failed update check is displayable and retries on the next watch", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, { plugins: [systemPlugin()] }),
        );
        server.respondStream(
            "POST",
            /^\/v0\/admin\/systemPlugins\/[^/]+\/checkForUpdate$/,
            [
                {
                    event: "failed",
                    data: {
                        error: "invalid_package",
                        message: "The installed plugin path no longer exists remotely",
                    },
                },
            ],
            [
                {
                    event: "checked",
                    data: {
                        update: {
                            pluginId: "plugin-1",
                            checkedAt: "2026-01-02T00:00:00.000Z",
                            updateAvailable: false,
                            installed: { version: "1.0.0", packageDigest: "digest-1" },
                            remote: { version: "1.0.0", packageDigest: "digest-1" },
                        },
                    },
                },
            ],
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = surfaceCreate(runtime);
        await pluginsLoad({ runtime, plugins: binding });
        binding.getState().updateChecksStart();
        await Promise.all(routed);
        expect(binding.getState().updateChecks.get("plugin-1")).toMatchObject({
            status: "failed",
            error: { message: "The installed plugin path no longer exists remotely" },
        });
        binding.getState().updateChecksStop();
        binding.getState().updateChecksStart();
        await Promise.all(routed);
        expect(binding.getState().updateChecks.get("plugin-1")).toMatchObject({
            status: "checked",
            update: { updateAvailable: false },
        });
        runtime.stop();
    });
});
