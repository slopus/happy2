import { happyStateCreate, type PluginCatalogItem, type PluginsSnapshot } from "happy2-state";
import type {
    PluginLocalOpenInput,
    PluginLocalPrepareInput,
    PluginMcpRuntime,
} from "happy2-server";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("plugin catalog across happy2-state and the real server", () => {
    it("loads the catalog, installs the bundled hello package, and reconciles health over realtime", async () => {
        await using server = await createGymServer({
            pluginMcpRuntime: new StubPluginMcpRuntime(),
        });
        const admin = await server.createUser({ username: "state_plugin_admin" });

        const transport = await createGymStateTransport(server, admin);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const plugins = state.plugins();
        await state.whenIdle();

        const hello = readyCatalog(plugins.getState()).find((item) => item.shortName === "hello");
        expect(hello).toMatchObject({ displayName: "Hello" });
        expect(hello?.systemPlugin).toBeUndefined();

        // A typed install intent creates a durable installation. Container
        // preparation continues asynchronously, so the installation streams
        // through the lifecycle to ready via realtime hints while the ready
        // catalog stays on screen the whole time.
        plugins.getState().pluginInstall("hello", {});
        await state.whenIdle();
        expect(plugins.getState().installing).toEqual([]);
        expect(plugins.getState().actionError).toBeUndefined();
        expect(helloInstallations(plugins.getState())).toHaveLength(1);
        await expect
            .poll(() => helloInstallations(plugins.getState())[0]?.status, { timeout: 5_000 })
            .toBe("ready");
        expect(plugins.getState().catalog.type).toBe("ready");

        // An install performed by another surface reaches this retained store
        // through the realtime hint and durable catalog reconciliation.
        const second = await server.as(admin).post("/v0/admin/plugins/hello/installPlugin", {});
        expect(second.statusCode).toBe(202);
        await expect
            .poll(() => helloInstallations(plugins.getState()).length, { timeout: 5_000 })
            .toBe(2);

        // The catalog icon travels through the authenticated transport as PNG bytes.
        const icon = await state.pluginIconDownload("hello");
        expect(icon.byteLength).toBeGreaterThan(0);
    });

    it("surfaces a displayable error instead of a catalog for a non-administrator", async () => {
        await using server = await createGymServer();
        await server.createUser({ username: "state_plugin_boot_admin" });
        const member = await server.createUser({ username: "state_plugin_member" });

        const transport = await createGymStateTransport(server, member);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const plugins = state.plugins();
        await state.whenIdle();

        expect(plugins.getState().catalog.type).toBe("error");
    });
});

function readyCatalog(snapshot: PluginsSnapshot): readonly PluginCatalogItem[] {
    return snapshot.catalog.type === "ready" ? snapshot.catalog.value : [];
}

function helloInstallations(snapshot: PluginsSnapshot) {
    return (
        readyCatalog(snapshot).find((item) => item.shortName === "hello")?.systemPlugin
            ?.installations ?? []
    );
}

/** Answers the local MCP lifecycle in memory so hello's bundled container becomes ready without Docker. */
class StubPluginMcpRuntime implements PluginMcpRuntime {
    async prepareLocal(input: PluginLocalPrepareInput): Promise<{ imageTag: string }> {
        return { imageTag: input.imageTag };
    }

    async openLocal(_input: PluginLocalOpenInput) {
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            async send(message) {
                if (!("id" in message) || !("method" in message)) return;
                const result =
                    message.method === "initialize"
                        ? {
                              protocolVersion: "2025-06-18",
                              capabilities: { tools: {} },
                              serverInfo: { name: "gym-plugin", version: "1.0.0" },
                          }
                        : message.method === "tools/list"
                          ? { tools: [] }
                          : {};
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async removeLocal(_containerName: string): Promise<void> {}
}
