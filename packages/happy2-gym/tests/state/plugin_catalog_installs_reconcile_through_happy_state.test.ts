import { happyStateCreate, type PluginCatalogItem, type PluginsSnapshot } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("plugin catalog across happy2-state and the real server", () => {
    it("loads the catalog, installs the bundled hello package, and reconciles installs over realtime", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "state_plugin_admin" });

        const transport = await createGymStateTransport(server, admin);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const plugins = state.plugins();
        await state.whenIdle();

        const hello = readyCatalog(plugins.getState()).find((item) => item.shortName === "hello");
        expect(hello).toMatchObject({ displayName: "Hello", variables: [] });
        expect(hello?.systemPlugin).toBeUndefined();

        // A typed install intent creates a durable installation; a skills-only
        // package is ready immediately and the reconciled catalog carries it.
        plugins.getState().pluginInstall("hello", {});
        await state.whenIdle();
        expect(plugins.getState().installing).toEqual([]);
        expect(plugins.getState().actionError).toBeUndefined();
        const installed = readyCatalog(plugins.getState()).find(
            (item) => item.shortName === "hello",
        );
        expect(installed?.systemPlugin?.installations).toHaveLength(1);
        expect(installed?.systemPlugin?.installations[0]).toMatchObject({
            shortName: "hello",
            status: "ready",
        });

        // An install performed by another surface reaches this retained store
        // through the realtime hint and durable catalog reconciliation.
        const second = await server.as(admin).post("/v0/admin/plugins/hello/installPlugin", {});
        expect(second.statusCode).toBe(202);
        await expect
            .poll(
                () =>
                    readyCatalog(plugins.getState()).find((item) => item.shortName === "hello")
                        ?.systemPlugin?.installations.length,
                { timeout: 5_000 },
            )
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
