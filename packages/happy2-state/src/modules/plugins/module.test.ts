import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { pluginsLoad, pluginsOutputRoute, pluginsStoreCreate } from "./pluginsState.js";

const catalogItem = {
    displayName: "Hello",
    shortName: "hello",
    description: "A minimal skills-only plugin.",
    version: "1.0.0",
    packageDigest: "digest-1",
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
        binding.getState().pluginInstall("hello", { API_TOKEN: "secret value" });
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
        binding.getState().pluginInstall("hello", {});
        await Promise.all(routed);
        const install = server.requests.find((request) => request.method === "POST");
        expect(install?.body).toEqual({});
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
        binding.getState().pluginInstall("hello", {});
        await Promise.all(routed);
        expect(binding.getState().installing).toEqual([]);
        expect(binding.getState().actionError?.message).toBe("PROJECT_API_TOKEN is required.");
        runtime.stop();
    });

    it("clears a previous action error before the next typed intent", () => {
        const output = vi.fn();
        const binding = pluginsStoreCreate(output);
        binding
            .getState()
            .pluginsInput({
                type: "pluginInstallFailed",
                shortName: "hello",
                error: new Error("bad") as never,
            });
        binding.getState().pluginInstall("hello", {});
        expect(binding.getState().actionError).toBeUndefined();
        expect(output).toHaveBeenCalledWith({
            type: "pluginInstallSubmitted",
            shortName: "hello",
            variables: {},
        });
    });
});
