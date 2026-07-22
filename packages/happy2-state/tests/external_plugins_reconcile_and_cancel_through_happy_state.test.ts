import { describe, expect, it } from "vitest";
import { happyStateCreate, type SystemPluginSummary } from "../src/index.js";
import {
    createFakeServer as createBareFakeServer,
    jsonResponse,
    type FakeStreamController,
} from "../src/testing/index.js";

function createFakeServer() {
    const server = createBareFakeServer();
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: new Date().toISOString() }),
    );
    return server;
}

const image = {
    contentType: "image/png",
    size: 10,
    width: 1024,
    height: 1024,
    thumbhash: "hash",
    checksumSha256: "checksum",
} as const;

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
        image,
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updateAvailable: false,
        installations: [],
        ...overrides,
    };
}

const installation = {
    id: "installation-1",
    pluginId: "plugin-1",
    shortName: "linked-tools",
    sourceVersion: "1.0.0",
    packageDigest: "digest-1",
    grantedPermissions: [],
    status: "preparing" as const,
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

const candidate = {
    preparedToken: "token-1",
    expiresAt: "2026-01-01T00:15:00.000Z",
    sourceKind: "zip_url",
    sourceReference: "https://example.com/plugin.zip",
    packageDigest: "digest-1",
    version: "1.0.0",
    displayName: "Linked Tools",
    shortName: "linked-tools",
    description: "Tools linked from a ZIP URL.",
    skills: [],
    variables: [],
    apiPermissions: [],
    image,
};

function syncStateRoute(server: ReturnType<typeof createFakeServer>): void {
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: "now",
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
    server.respond("GET", "/v0/projects", jsonResponse(200, { projects: [] }));
    server.respond(
        "POST",
        "/v0/sync/getDifference",
        jsonResponse(200, {
            kind: "difference",
            changedChats: [],
            removedChatIds: [],
            areas: ["plugins"],
            state: { generation: "g", sequence: "1" },
            targetState: { generation: "g", sequence: "1" },
        }),
    );
    server.respond("POST", "/v0/sync/acknowledge", jsonResponse(202, { accepted: true }));
}

describe("external plugins reconcile and cancel through HappyState", () => {
    it("reconciles durable installation lifecycle from a plugins-area realtime hint", async () => {
        const server = createFakeServer();
        syncStateRoute(server);
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, {
                plugins: [systemPlugin({ installations: [installation] })],
            }),
            jsonResponse(200, {
                plugins: [
                    systemPlugin({
                        installations: [
                            {
                                ...installation,
                                status: "ready",
                                readyAt: "2026-01-01T00:01:00.000Z",
                            },
                        ],
                    }),
                ],
            }),
        );
        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        const plugins = state.plugins();
        await state.whenIdle();
        expect(plugins.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ installations: [{ status: "preparing" }] }],
        });
        // The realtime event is only a hint; the durable read is authoritative
        // and the ready list never blanks while it reloads.
        let sawLoading = false;
        const unsubscribe = plugins.subscribe((snapshot) => {
            if (snapshot.systemPlugins.type !== "ready") sawLoading = true;
        });
        server.events.sync({ sequence: "1", areas: ["plugins"] });
        await state.whenIdle();
        unsubscribe();
        expect(sawLoading).toBe(false);
        expect(plugins.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ installations: [{ status: "ready" }] }],
        });
    });

    it("reconciles the plugin surface eagerly after a prepared-token install", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, { plugins: [] }),
            jsonResponse(200, {
                plugins: [systemPlugin({ installations: [installation] })],
            }),
        );
        server.respondStream("POST", "/v0/admin/pluginPackages/preparePlugin", [
            { event: "prepared", data: { selectionRequired: false, candidates: [candidate] } },
        ]);
        server.respond(
            "POST",
            "/v0/admin/pluginPackages/installPlugin",
            jsonResponse(202, { installation }),
        );
        using state = happyStateCreate({ transport: server.transport });
        const plugins = state.plugins();
        const install = state.pluginInstall();
        await state.whenIdle();
        install.getState().sourceKindUpdate("zip_url");
        install.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        install.getState().prepareSubmit();
        await state.whenIdle();
        expect(install.getState().step).toMatchObject({ step: "configure" });
        install.getState().installSubmit({}, []);
        await state.whenIdle();
        expect(install.getState().step).toMatchObject({
            step: "installed",
            installation: { id: "installation-1" },
        });
        expect(plugins.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ id: "plugin-1", installations: [{ id: "installation-1" }] }],
        });
    });

    it("disposal cancels open preparation and update-check streams", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/plugins", jsonResponse(200, { plugins: [] }));
        server.respond(
            "GET",
            "/v0/admin/systemPlugins",
            jsonResponse(200, { plugins: [systemPlugin({ installations: [installation] })] }),
        );
        let prepareStream!: FakeStreamController;
        server.streamRoute("POST", "/v0/admin/pluginPackages/preparePlugin", (_request, s) => {
            prepareStream = s;
        });
        let checkStream!: FakeStreamController;
        server.streamRoute(
            "POST",
            /^\/v0\/admin\/pluginInstallations\/[^/]+\/checkForUpdate$/,
            (_request, s) => {
                checkStream = s;
            },
        );
        const state = happyStateCreate({ transport: server.transport });
        const plugins = state.plugins();
        const install = state.pluginInstall();
        await state.whenIdle();
        plugins.getState().updateChecksStart();
        install.getState().sourceKindUpdate("github");
        install.getState().sourceUrlUpdate("https://github.com/example/tools");
        install.getState().prepareSubmit();
        expect(checkStream.aborted).toBe(false);
        expect(prepareStream.aborted).toBe(false);
        state[Symbol.dispose]();
        expect(checkStream.aborted).toBe(true);
        expect(prepareStream.aborted).toBe(true);
        await state.whenIdle();
    });
});
