import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
    pluginCatalogLoad,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";

const SELECTOR_URI = "ui://surface-lab/selector.html";
const LIST_URI = "ui://surface-lab/list.html";
const FOREIGN_URI = "ui://surface-foreign/app.html";
const APP_MIME = "text/html;profile=mcp-app";
const SNAPSHOTTED_SELECTOR_HTML =
    "<!doctype html><title>Saved selector</title><main id=selector></main>";
const SNAPSHOTTED_LIST_HTML = "<!doctype html><title>Saved list</title><main id=list></main>";
const LIVE_SELECTOR_HTML =
    "<!doctype html><title>Changed live selector</title><main id=changed></main>";
const PLUGIN_ICON = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("durable plugin apps and native contributions", () => {
    it("scopes multiple apps, executes only bound actions, preserves snapshots and preferences, and cascades uninstall", async () => {
        const catalogRoot = await mkdtemp(join(tmpdir(), "happy2-durable-plugin-surfaces-"));
        try {
            await Promise.all([
                writeSurfacePlugin(catalogRoot, "surface-lab", "Surface Lab"),
                writeSurfacePlugin(catalogRoot, "surface-foreign", "Foreign Surface"),
            ]);
            const runtime = new SurfaceRuntime();
            await using server = await createGymServer({
                pluginCatalog: await pluginCatalogLoad(catalogRoot),
                pluginMcpRuntime: runtime,
            });
            const alice = await server.createUser({
                username: "surface_alice",
                firstName: "Alice",
            });
            const bob = await server.createUser({ username: "surface_bob", firstName: "Bob" });
            const asAlice = server.as(alice);
            const asBob = server.as(bob);

            const primary = await installPlugin(asAlice, "surface-lab", runtime);
            const foreign = await installPlugin(asAlice, "surface-foreign", runtime);
            const primaryHeaders = runtime.hostHeaders(primary.installationId);

            const selector = await hostPost(
                server,
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "selector",
                    resourceUri: SELECTOR_URI,
                    title: "Todo lists",
                    context: { view: "selector" },
                    position: 10,
                }),
                primaryHeaders,
            );
            const listA = await hostPost(
                server,
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "list-a",
                    resourceUri: LIST_URI,
                    title: "Launch checklist",
                    context: { listId: "list-a" },
                    position: 20,
                }),
                primaryHeaders,
            );
            const listB = await hostPost(
                server,
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "list-b",
                    resourceUri: LIST_URI,
                    title: "Release checklist",
                    context: { listId: "list-b" },
                    position: 30,
                }),
                primaryHeaders,
            );
            expect([selector, listA, listB]).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ created: true, revision: 1, dataRevision: 0 }),
                ]),
            );

            const profile = await hostPost(
                server,
                "/contributions/putContribution",
                profileContribution(),
                primaryHeaders,
            );
            const scopeButton = await hostPost(
                server,
                "/contributions/putContribution",
                scopeContribution(),
                primaryHeaders,
            );
            const dynamicMenu = await hostPost(
                server,
                "/contributions/putContribution",
                asyncMenuContribution(),
                primaryHeaders,
            );
            const staticMenu = await hostPost(
                server,
                "/contributions/putContribution",
                staticMenuContribution(),
                primaryHeaders,
            );
            expect([profile, scopeButton, dynamicMenu, staticMenu]).toEqual(
                expect.arrayContaining([expect.objectContaining({ created: true, revision: 1 })]),
            );

            expect((await server.get("/v0/apps")).statusCode).toBe(401);
            expect((await server.get("/v0/contributions")).statusCode).toBe(401);
            const aliceApps = await visibleApps(asAlice);
            const bobApps = await visibleApps(asBob);
            expect(aliceApps.map(({ instanceKey }) => instanceKey)).toEqual([
                "selector",
                "list-a",
                "list-b",
            ]);
            expect(bobApps.map(({ instanceKey }) => instanceKey)).toEqual([
                "selector",
                "list-a",
                "list-b",
            ]);
            expect(aliceApps.every(({ scope }) => scope === "all_users")).toBe(true);

            runtime.selectorHtml = LIVE_SELECTOR_HTML;
            const loaded = await asAlice.get(`/v0/apps/${selector.id}`);
            expect(loaded.statusCode).toBe(200);
            expect(loaded.json()).toMatchObject({
                app: {
                    id: selector.id,
                    instanceKey: "selector",
                    resourceUri: SELECTOR_URI,
                    context: { view: "selector" },
                    dataRevision: 0,
                    revision: 1,
                },
                resource: {
                    html: SNAPSHOTTED_SELECTOR_HTML,
                    contentHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
                    csp: { connectDomains: [], resourceDomains: [] },
                    permissions: { clipboardWrite: {} },
                    prefersBorder: true,
                },
                hostContext: {
                    "happy2/instance": {
                        id: selector.id,
                        key: "selector",
                        context: { view: "selector" },
                        dataRevision: 0,
                        definitionRevision: 1,
                    },
                },
            });
            const liveResource = await asAlice.post(`/v0/apps/${selector.id}/readResource`, {
                uri: SELECTOR_URI,
            });
            expect(liveResource.statusCode).toBe(200);
            expect(liveResource.json().result.contents[0]).toMatchObject({
                uri: SELECTOR_URI,
                text: LIVE_SELECTOR_HTML,
            });

            const accepted = await asAlice.post(`/v0/apps/${selector.id}/callTool`, {
                name: "app_only",
                arguments: { source: "selector" },
            });
            expect(accepted.statusCode).toBe(200);
            expect(accepted.json().result).toMatchObject({
                content: [{ type: "text", text: "app_only accepted" }],
            });
            expect(runtime.lastCall(primary.installationId, "app_only")).toMatchObject({
                arguments: { source: "selector" },
                _meta: {
                    "happy2/instance": { id: selector.id, key: "selector" },
                    "happy2/viewer": { id: alice.id, token: expect.any(String) },
                },
            });
            for (const name of ["model_only", "does_not_exist", "foreign_only"])
                expect(
                    (
                        await asAlice.post(`/v0/apps/${selector.id}/callTool`, {
                            name,
                            arguments: {},
                        })
                    ).statusCode,
                ).toBe(403);
            expect(runtime.calls.some((call) => call.name === "model_only")).toBe(false);
            expect(runtime.calls.some((call) => call.name === "foreign_only")).toBe(false);

            const viewer = runtime.capability(primary.installationId, "app_only", "happy2/viewer");
            const aliceOnly = await hostPost(
                server,
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "alice-private",
                    resourceUri: LIST_URI,
                    title: "Alice private list",
                    context: { listId: "alice-private" },
                    position: 40,
                    audience: { scope: "user" },
                }),
                runtime.hostHeaders(primary.installationId, { viewerToken: viewer.token }),
            );
            expect((await visibleApps(asAlice)).map(({ id }) => id)).toContain(aliceOnly.id);
            expect((await visibleApps(asBob)).map(({ id }) => id)).not.toContain(aliceOnly.id);

            const channel = await asAlice.post("/v0/chats/createChannel", {
                kind: "private_channel",
                name: "Surface collaborators",
                slug: "surface-collaborators",
            });
            expect(channel.statusCode).toBe(201);
            const chatId = channel.json().chat.id as string;
            expect(
                (await asAlice.post(`/v0/chats/${chatId}/addMember`, { userId: bob.id }))
                    .statusCode,
            ).toBe(200);

            const globalContributions = await visibleContributions(asAlice);
            expect(globalContributions.map(({ externalKey }) => externalKey)).toEqual([
                "profile-preferences",
                "scope-bootstrap",
                "dynamic-actions",
                "static-actions",
            ]);
            expect(
                globalContributions.find(({ externalKey }) => externalKey === "static-actions")
                    ?.spec,
            ).toMatchObject({
                kind: "staticMenu",
                items: [
                    { id: "open-first", kind: "button", assetId: "todo" },
                    { id: "open-second", kind: "button", assetId: "todo" },
                ],
            });
            const scopeInvocation = await asAlice.post(
                `/v0/contributions/${scopeButton.id}/invoke`,
                { actionId: "create-scoped", chatId },
            );
            expect(scopeInvocation.statusCode).toBe(200);
            expect(scopeInvocation.json()).toMatchObject({
                result: { content: [{ type: "text", text: "scope_context accepted" }] },
                openApp: { instanceId: listA.id, presentation: "modal" },
            });
            const scopedCall = runtime.lastCall(primary.installationId, "scope_context");
            expect(scopedCall).toMatchObject({
                _meta: {
                    "happy2/chat": {
                        id: chatId,
                        triggeredByUserId: alice.id,
                        token: expect.any(String),
                    },
                    "happy2/contribution": {
                        id: scopeButton.id,
                        key: "scope-bootstrap",
                        placement: "chatMenu",
                        revision: 1,
                    },
                    "happy2/viewer": { id: alice.id, token: expect.any(String) },
                },
            });
            const scopedViewer = capability(scopedCall, "happy2/viewer");
            const scopedChat = capability(scopedCall, "happy2/chat");
            const scopedHeaders = runtime.hostHeaders(primary.installationId, {
                viewerToken: scopedViewer.token,
                chatToken: scopedChat.token,
            });
            const chatApp = await hostPost(
                server,
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "chat-list",
                    resourceUri: LIST_URI,
                    title: "Collaborative chat list",
                    context: { listId: "chat-list" },
                    position: 50,
                }),
                scopedHeaders,
            );
            const chatAction = await hostPost(
                server,
                "/contributions/putContribution",
                chatOnlyContribution(),
                scopedHeaders,
            );
            for (const client of [asAlice, asBob]) {
                expect((await visibleApps(client)).map(({ id }) => id)).toContain(chatApp.id);
                expect((await visibleContributions(client, chatId)).map(({ id }) => id)).toContain(
                    chatAction.id,
                );
            }
            expect((await visibleContributions(asBob)).map(({ id }) => id)).not.toContain(
                chatAction.id,
            );
            expect(
                (
                    await asBob.post(`/v0/contributions/${scopeButton.id}/invoke`, {
                        actionId: "create-scoped",
                        chatId,
                    })
                ).statusCode,
            ).toBe(200);
            const bobScopedCall = runtime.lastCall(primary.installationId, "scope_context");
            const bobScopedHeaders = runtime.hostHeaders(primary.installationId, {
                viewerToken: capability(bobScopedCall, "happy2/viewer").token,
                chatToken: capability(bobScopedCall, "happy2/chat").token,
            });

            const nested = await asAlice.post(`/v0/contributions/${profile.id}/invoke`, {
                actionId: "show-completed",
                value: true,
            });
            expect(nested.statusCode).toBe(200);
            expect(runtime.lastCall(primary.installationId, "nested_toggle")).toMatchObject({
                name: "nested_toggle",
                arguments: { value: true },
                _meta: {
                    "happy2/contribution": {
                        id: profile.id,
                        key: "profile-preferences",
                        placement: "profileSection",
                    },
                },
            });
            const callsBeforeSpoof = runtime.calls.length;
            expect(
                (
                    await asAlice.post(`/v0/contributions/${profile.id}/invoke`, {
                        actionId: "model_only",
                        value: true,
                    })
                ).statusCode,
            ).toBe(404);
            expect(runtime.calls).toHaveLength(callsBeforeSpoof);

            const resolved = await asAlice.post(`/v0/contributions/${dynamicMenu.id}/resolveMenu`, {
                chatId,
            });
            expect(resolved.statusCode).toBe(200);
            expect(resolved.json()).toEqual({
                items: [menuButton("dynamic-first", "app_only")],
                revision: 1,
            });
            runtime.menuResult = "oversized";
            expect(
                (
                    await asAlice.post(`/v0/contributions/${dynamicMenu.id}/resolveMenu`, {
                        chatId,
                    })
                ).statusCode,
            ).toBe(400);
            runtime.menuResult = "malformed";
            expect(
                (
                    await asAlice.post(`/v0/contributions/${dynamicMenu.id}/resolveMenu`, {
                        chatId,
                    })
                ).statusCode,
            ).toBe(400);
            runtime.menuResult = "valid";

            const rejectedCrossInstallation = await server.pluginHost().post(
                "/contributions/putContribution",
                {
                    ...scopeContribution(),
                    externalKey: "cross-install",
                    spec: {
                        ...(scopeContribution().spec as Record<string, unknown>),
                        action: { toolName: "foreign_only" },
                    },
                },
                { headers: primaryHeaders },
            );
            expect(rejectedCrossInstallation.statusCode).toBe(400);

            expect(
                (
                    await server.get(
                        `/v0/pluginInstallations/${primary.installationId}/uiAssets/todo`,
                    )
                ).statusCode,
            ).toBe(401);
            const asset = await asBob.get(
                `/v0/pluginInstallations/${primary.installationId}/uiAssets/todo`,
            );
            expect(asset.statusCode, asset.payload).toBe(200);
            expect(asset.headers["content-type"]).toBe("image/png");
            expect(asset.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
            await expect(sharp(asset.rawPayload).metadata()).resolves.toMatchObject({
                width: 40,
                height: 40,
                format: "png",
            });

            const hidden = await asAlice.post("/v0/me/updateAppPresentation", {
                instanceId: selector.id,
                hidden: true,
                position: 99,
            });
            expect(hidden.statusCode).toBe(200);
            expect(hidden.json().app).toMatchObject({
                id: selector.id,
                hidden: true,
                position: 99,
            });
            expect(await appById(asAlice, selector.id)).toMatchObject({
                hidden: true,
                position: 99,
            });
            expect(await appById(asBob, selector.id)).toMatchObject({
                hidden: false,
                position: 10,
            });
            const unhidden = await asAlice.post("/v0/me/updateAppPresentation", {
                instanceId: selector.id,
                hidden: false,
                position: 5,
            });
            expect(unhidden.statusCode).toBe(200);
            expect(await appById(asAlice, selector.id)).toMatchObject({
                hidden: false,
                position: 5,
            });

            const movedList = await hostPost(
                server,
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "list-a",
                    resourceUri: LIST_URI,
                    title: "Launch checklist updated",
                    context: { listId: "list-a", mode: "focused" },
                    position: 1,
                    revision: 1,
                }),
                primaryHeaders,
            );
            expect(movedList).toMatchObject({
                id: listA.id,
                created: false,
                revision: 2,
                dataRevision: 1,
            });
            const invalidated = await hostPost(
                server,
                "/apps/updateInstanceContext",
                { instanceKey: "list-a", context: { listId: "list-a", version: 2 } },
                primaryHeaders,
            );
            expect(invalidated).toMatchObject({ id: listA.id, dataRevision: 2 });
            const updatedApp = await asAlice.get(`/v0/apps/${listA.id}`);
            expect(updatedApp.json()).toMatchObject({
                app: {
                    title: "Launch checklist updated",
                    position: 1,
                    revision: 2,
                    dataRevision: 2,
                    context: { listId: "list-a", version: 2 },
                },
                resource: { html: SNAPSHOTTED_LIST_HTML },
            });
            const movedStatic = await hostPost(
                server,
                "/contributions/putContribution",
                { ...staticMenuContribution(), location: "sidebarMenu", position: 1, revision: 1 },
                primaryHeaders,
            );
            expect(movedStatic).toMatchObject({ id: staticMenu.id, revision: 2, created: false });
            expect(
                (await visibleContributions(asAlice)).find(({ id }) => id === staticMenu.id),
            ).toMatchObject({ location: "sidebarMenu", position: 1, revision: 2 });
            expect(
                await hostPost(
                    server,
                    "/apps/deleteInstance",
                    { instanceKey: "list-b" },
                    primaryHeaders,
                ),
            ).toMatchObject({ deleted: true });
            expect((await visibleApps(asAlice)).map(({ id }) => id)).not.toContain(listB.id);
            expect(
                await hostPost(
                    server,
                    "/contributions/deleteContribution",
                    { externalKey: "static-actions" },
                    primaryHeaders,
                ),
            ).toMatchObject({ deleted: true });

            expect(
                (await asAlice.post(`/v0/chats/${chatId}/removeMember`, { userId: bob.id }))
                    .statusCode,
            ).toBe(200);
            expect((await visibleApps(asBob)).map(({ id }) => id)).not.toContain(chatApp.id);
            expect((await asBob.get(`/v0/contributions?chatId=${chatId}`)).statusCode).toBe(404);
            expect(
                (
                    await asBob.post(`/v0/contributions/${chatAction.id}/invoke`, {
                        actionId: "chat-action",
                        chatId,
                    })
                ).statusCode,
            ).toBe(404);
            const revokedChatPut = await server.pluginHost().post(
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "revoked-chat",
                    resourceUri: LIST_URI,
                    title: "Must not exist",
                    context: {},
                    position: 81,
                }),
                { headers: bobScopedHeaders },
            );
            expect(revokedChatPut.statusCode).toBe(403);

            const bobAppCall = await asBob.post(`/v0/apps/${selector.id}/callTool`, {
                name: "app_only",
                arguments: { source: "bob" },
            });
            expect(bobAppCall.statusCode).toBe(200);
            const bobViewer = runtime.capability(
                primary.installationId,
                "app_only",
                "happy2/viewer",
            );
            expect((await asAlice.post(`/v0/admin/users/${bob.id}/banUser`)).statusCode).toBe(200);
            const revokedViewerPut = await server.pluginHost().post(
                "/apps/putInstance",
                appDefinition({
                    instanceKey: "revoked-viewer",
                    resourceUri: LIST_URI,
                    title: "Must not exist",
                    context: {},
                    position: 80,
                    audience: { scope: "user" },
                }),
                {
                    headers: runtime.hostHeaders(primary.installationId, {
                        viewerToken: bobViewer.token,
                    }),
                },
            );
            expect(revokedViewerPut.statusCode).toBe(404);

            const remainingPrimaryIds = (await visibleApps(asAlice))
                .filter(({ pluginId }) => pluginId === primary.pluginId)
                .map(({ id }) => id);
            expect(remainingPrimaryIds).toEqual(
                expect.arrayContaining([selector.id, listA.id, aliceOnly.id, chatApp.id]),
            );
            const uninstall = await asAlice.post(
                `/v0/admin/pluginInstallations/${primary.installationId}/uninstallPlugin`,
                {},
            );
            expect(uninstall.statusCode).toBe(200);
            expect(uninstall.json()).toEqual({ uninstalled: true });
            expect(
                (await visibleApps(asAlice)).some(({ pluginId }) => pluginId === primary.pluginId),
            ).toBe(false);
            expect(
                (await visibleContributions(asAlice)).some(
                    ({ pluginId }) => pluginId === primary.pluginId,
                ),
            ).toBe(false);
            for (const id of remainingPrimaryIds)
                expect((await asAlice.get(`/v0/apps/${id}`)).statusCode).toBe(404);
            expect(
                (
                    await asAlice.get(
                        `/v0/pluginInstallations/${primary.installationId}/uiAssets/todo`,
                    )
                ).statusCode,
            ).toBe(404);
            expect(
                (await visibleApps(asAlice)).some(({ pluginId }) => pluginId === foreign.pluginId),
            ).toBe(false);
        } finally {
            await rm(catalogRoot, { force: true, recursive: true });
        }
    });
});

type SurfaceRecord = Record<string, unknown> & {
    id: string;
    instanceKey?: string;
    externalKey?: string;
    pluginId: string;
    scope?: string;
    spec?: Record<string, unknown>;
};

type CapabilityName = "happy2/viewer" | "happy2/chat";

interface RuntimeCall {
    installationId: string;
    name: string;
    arguments: Record<string, unknown>;
    _meta?: Record<string, unknown>;
}

interface HostResult extends Record<string, unknown> {
    id: string;
}

class SurfaceRuntime implements PluginMcpRuntime {
    readonly calls: RuntimeCall[] = [];
    menuResult: "valid" | "oversized" | "malformed" = "valid";
    selectorHtml = SNAPSHOTTED_SELECTOR_HTML;
    readonly #instances = new Map<
        string,
        {
            containerInstanceId: string;
            kind: "primary" | "foreign";
            running: boolean;
            token?: string;
        }
    >();
    #sequence = 0;

    async prepareLocal(input: PluginLocalPrepareInput) {
        this.#instances.set(input.installationId, {
            containerInstanceId: input.existingContainerInstanceId ?? input.containerInstanceId,
            kind: this.#sequence++ === 0 ? "primary" : "foreign",
            running: true,
        });
        return {
            containerInstanceId: input.existingContainerInstanceId ?? input.containerInstanceId,
            imageTag: input.imageTag,
            reused: input.existingContainerInstanceId !== undefined,
        };
    }

    async startLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async monitorLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async openLocal(input: PluginLocalOpenInput) {
        const installationId = input.containerName.replace(/^happy2-plugin-/, "");
        const instance = this.#instances.get(installationId);
        if (!instance) throw new Error(`Unknown plugin container ${input.containerName}`);
        instance.token = required(input.environment.HAPPY2_PLUGIN_API_TOKEN, "runtime token");
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            send: async (message) => {
                if (!("id" in message) || !("method" in message)) return;
                let result: Record<string, unknown>;
                if (message.method === "initialize") {
                    result = {
                        protocolVersion: "2025-06-18",
                        capabilities: { resources: {}, tools: {} },
                        serverInfo: { name: "surface-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = { tools: tools(instance.kind) };
                } else if (message.method === "resources/read") {
                    const { uri } = message.params as { uri: string };
                    result = { contents: [this.resource(instance.kind, uri)] };
                } else if (message.method === "tools/call") {
                    const params = message.params as {
                        name: string;
                        arguments?: Record<string, unknown>;
                        _meta?: Record<string, unknown>;
                    };
                    this.calls.push({
                        installationId,
                        name: params.name,
                        arguments: structuredClone(params.arguments ?? {}),
                        ...(params._meta ? { _meta: structuredClone(params._meta) } : {}),
                    });
                    result = this.toolResult(params.name);
                } else {
                    result = {};
                }
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async isLocalRunning(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean> {
        const instance = this.#instances.get(installationId);
        return Boolean(
            instance?.running &&
            containerName === `happy2-plugin-${installationId}` &&
            instance.containerInstanceId === containerInstanceId,
        );
    }

    async removeLocal(containerName: string): Promise<void> {
        const installationId = containerName.replace(/^happy2-plugin-/, "");
        const instance = this.#instances.get(installationId);
        if (instance) instance.running = false;
    }

    hostHeaders(
        installationId: string,
        capabilities: { viewerToken?: string; chatToken?: string } = {},
    ): Record<string, string> {
        const token = required(this.#instances.get(installationId)?.token, "runtime token");
        return {
            authorization: `Bearer ${token}`,
            ...(capabilities.viewerToken
                ? { "x-happy2-viewer-token": capabilities.viewerToken }
                : {}),
            ...(capabilities.chatToken ? { "x-happy2-chat-token": capabilities.chatToken } : {}),
        };
    }

    lastCall(installationId: string, name: string): RuntimeCall {
        const call = this.calls.findLast(
            (candidate) => candidate.installationId === installationId && candidate.name === name,
        );
        if (!call) throw new Error(`No ${name} call for ${installationId}`);
        return call;
    }

    capability(installationId: string, name: string, capabilityName: CapabilityName) {
        return capability(this.lastCall(installationId, name), capabilityName);
    }

    private resource(kind: "primary" | "foreign", uri: string): Record<string, unknown> {
        const text =
            kind === "foreign"
                ? "<!doctype html><title>Foreign app</title>"
                : uri === SELECTOR_URI
                  ? this.selectorHtml
                  : SNAPSHOTTED_LIST_HTML;
        return {
            uri,
            mimeType: APP_MIME,
            text,
            _meta: {
                ui: {
                    csp: { connectDomains: [], resourceDomains: [] },
                    permissions: { clipboardWrite: {} },
                    prefersBorder: true,
                },
            },
        };
    }

    private toolResult(name: string): Record<string, unknown> {
        if (name === "menu_resolver") {
            const items =
                this.menuResult === "valid"
                    ? [menuButton("dynamic-first", "app_only")]
                    : this.menuResult === "oversized"
                      ? Array.from({ length: 33 }, (_, index) =>
                            menuButton(`dynamic-${index}`, "app_only"),
                        )
                      : [{ kind: "button", id: "broken" }];
            return {
                content: [{ type: "text", text: "Dynamic menu" }],
                structuredContent: { items },
            };
        }
        return {
            content: [{ type: "text", text: `${name} accepted` }],
            structuredContent: { accepted: true },
        };
    }
}

function tools(kind: "primary" | "foreign"): Record<string, unknown>[] {
    if (kind === "foreign") return [tool("foreign_only", "Foreign only", ["app"], FOREIGN_URI)];
    return [
        tool("selector_snapshot", "Selector snapshot", ["model", "app"], SELECTOR_URI),
        tool("list_snapshot", "List snapshot", ["app"], LIST_URI),
        tool("app_only", "App-only action", ["app"]),
        tool("model_only", "Model-only action", ["model"]),
        tool("nested_toggle", "Toggle completed", ["app"]),
        tool("scope_context", "Create scoped surfaces", ["app"]),
        tool("menu_resolver", "Resolve menu", ["app"]),
    ];
}

function tool(
    name: string,
    title: string,
    visibility: readonly ("model" | "app")[],
    resourceUri?: string,
): Record<string, unknown> {
    return {
        name,
        title,
        description: `${title} in the durable surface gym fixture.`,
        inputSchema: { type: "object", additionalProperties: true },
        _meta: { ui: { visibility, ...(resourceUri ? { resourceUri } : {}) } },
    };
}

function appDefinition(input: {
    instanceKey: string;
    resourceUri: string;
    title: string;
    context: Record<string, unknown>;
    position: number;
    revision?: number;
    audience?: { scope: "all_users" | "user" };
}): Record<string, unknown> {
    return {
        assetId: "todo",
        audience: input.audience ?? { scope: "all_users" },
        context: input.context,
        description: `${input.title} app instance.`,
        instanceKey: input.instanceKey,
        position: input.position,
        presentation: "sidebar",
        resourceUri: input.resourceUri,
        ...(input.revision === undefined ? {} : { revision: input.revision }),
        title: input.title,
    };
}

function profileContribution(): Record<string, unknown> {
    return {
        audience: { scope: "all_users" },
        description: "Configures collaborative TODO presentation.",
        externalKey: "profile-preferences",
        location: "profileSection",
        position: 10,
        title: "TODO preferences",
        spec: {
            kind: "section",
            id: "todo-preferences",
            title: "TODO preferences",
            description: "Controls the current TODO presentation.",
            controls: [
                {
                    kind: "text",
                    id: "preference-help",
                    title: "About TODO preferences",
                    description: "Explains the preference controls.",
                    text: "These preferences apply to the shared TODO surface.",
                },
                {
                    kind: "checkbox",
                    id: "show-completed",
                    title: "Show completed",
                    description: "Shows completed TODO items.",
                    checked: false,
                    action: { toolName: "nested_toggle" },
                },
            ],
        },
    };
}

function scopeContribution(): Record<string, unknown> {
    return {
        audience: { scope: "all_users" },
        description: "Creates surfaces for the current viewer and chat.",
        externalKey: "scope-bootstrap",
        location: "chatMenu",
        position: 20,
        title: "Create scoped list",
        spec: {
            kind: "button",
            id: "create-scoped",
            title: "Create scoped list",
            description: "Creates a list scoped to this conversation.",
            assetId: "todo",
            action: {
                toolName: "scope_context",
                openApp: { instanceKey: "list-a", presentation: "modal" },
            },
        },
    };
}

function asyncMenuContribution(): Record<string, unknown> {
    return {
        audience: { scope: "all_users" },
        description: "Loads bounded actions from the plugin.",
        externalKey: "dynamic-actions",
        location: "chatMenu",
        position: 30,
        title: "Dynamic TODO actions",
        spec: {
            kind: "asyncMenu",
            id: "dynamic-actions-menu",
            title: "Dynamic TODO actions",
            description: "Loads the current TODO actions.",
            resolverToolName: "menu_resolver",
        },
    };
}

function staticMenuContribution(): Record<string, unknown> {
    return {
        audience: { scope: "all_users" },
        description: "Opens one of two known TODO lists.",
        externalKey: "static-actions",
        location: "composerMenu",
        position: 40,
        title: "TODO lists",
        spec: {
            kind: "staticMenu",
            id: "static-actions-menu",
            title: "TODO lists",
            description: "Selects a known TODO list.",
            items: [menuButton("open-first", "app_only"), menuButton("open-second", "app_only")],
        },
    };
}

function chatOnlyContribution(): Record<string, unknown> {
    return {
        audience: { scope: "all_users" },
        description: "Runs only for members of the scoped chat.",
        externalKey: "chat-only-action",
        location: "composerIcon",
        position: 1,
        title: "Chat TODO",
        spec: {
            kind: "button",
            id: "chat-action",
            title: "Chat TODO",
            description: "Runs the chat-scoped TODO action.",
            assetId: "todo",
            action: { toolName: "app_only" },
        },
    };
}

function menuButton(id: string, toolName: string): Record<string, unknown> {
    return {
        kind: "button",
        id,
        title: `Action ${id}`,
        description: `Runs action ${id}.`,
        assetId: "todo",
        action: { toolName },
    };
}

async function installPlugin(
    client: GymRequestClient,
    shortName: string,
    runtime: SurfaceRuntime,
): Promise<{ installationId: string; pluginId: string }> {
    const response = await client.post(`/v0/admin/plugins/${shortName}/installPlugin`, {
        permissions: ["apps:manage", "contributions:manage"],
    });
    expect(response.statusCode).toBe(202);
    const installationId = response.json().installation.id as string;
    const pluginId = response.json().installation.pluginId as string;
    await waitForInstallation(client, installationId, "ready");
    runtime.hostHeaders(installationId);
    return { installationId, pluginId };
}

async function hostPost(
    server: { pluginHost(): GymRequestClient },
    path: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
): Promise<HostResult> {
    const response = await server.pluginHost().post(path, body, { headers });
    expect(response.statusCode, `${path}: ${response.body}`).toBe(200);
    return response.json() as HostResult;
}

async function visibleApps(client: GymRequestClient): Promise<SurfaceRecord[]> {
    const response = await client.get("/v0/apps");
    expect(response.statusCode).toBe(200);
    return response.json().apps as SurfaceRecord[];
}

async function visibleContributions(
    client: GymRequestClient,
    chatId?: string,
): Promise<SurfaceRecord[]> {
    const response = await client.get(`/v0/contributions${chatId ? `?chatId=${chatId}` : ""}`);
    expect(response.statusCode).toBe(200);
    return response.json().contributions as SurfaceRecord[];
}

async function appById(client: GymRequestClient, id: string): Promise<SurfaceRecord> {
    const app = (await visibleApps(client)).find((candidate) => candidate.id === id);
    if (!app) throw new Error(`App ${id} was not visible`);
    return app;
}

function capability(call: RuntimeCall, name: CapabilityName): { id: string; token: string } {
    const value = call._meta?.[name];
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${name} capability was missing`);
    const { id, token } = value as Record<string, unknown>;
    return { id: required(id, `${name} id`), token: required(token, `${name} token`) };
}

async function writeSurfacePlugin(root: string, shortName: string, displayName: string) {
    const directory = join(root, shortName);
    await mkdir(join(directory, "assets"), { recursive: true });
    await mkdir(join(directory, "container"), { recursive: true });
    await writeFile(join(directory, "plugin.png"), PLUGIN_ICON);
    await actionAssetWrite(join(directory, "assets", "todo.png"));
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName,
            shortName,
            description: `${displayName} durable surface gym fixture.`,
            variables: [],
            uiAssets: [{ id: "todo", path: "assets/todo.png" }],
            container: {
                dockerfile: "container/Dockerfile",
                permissions: ["apps:manage", "contributions:manage"],
            },
            mcp: { type: "stdio", command: "node", args: ["/plugin/server.js"] },
        }),
    );
    await writeFile(join(directory, "server.js"), "// Replaced by the gym MCP runtime.\n");
    await writeFile(
        join(directory, "container", "Dockerfile"),
        'FROM node:24-alpine\nWORKDIR /plugin\nCOPY server.js /plugin/server.js\nCMD ["sleep", "infinity"]\n',
    );
}

async function actionAssetWrite(path: string): Promise<void> {
    const pixels = Buffer.alloc(40 * 40 * 4);
    for (let y = 8; y < 32; y += 1)
        for (let x = 8; x < 32; x += 1) {
            if (x > 11 && x < 29 && y > 11 && y < 29 && (x + y) % 7 !== 0) continue;
            const offset = (y * 40 + x) * 4;
            pixels[offset + 3] = x === 8 || y === 8 ? 128 : 255;
        }
    await sharp(pixels, { raw: { width: 40, height: 40, channels: 4 } })
        .png()
        .toFile(path);
}

async function waitForInstallation(
    client: GymRequestClient,
    installationId: string,
    status: string,
): Promise<void> {
    await waitFor(async () => {
        const catalog = await client.get("/v0/admin/plugins");
        return catalog
            .json()
            .plugins.flatMap(
                (plugin: {
                    systemPlugin?: { installations?: Array<{ id: string; status: string }> };
                }) => plugin.systemPlugin?.installations ?? [],
            )
            .some(
                (installation: { id: string; status: string }) =>
                    installation.id === installationId && installation.status === status,
            );
    }, `plugin installation ${status}`);
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 10_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}

function required(value: unknown, label: string): string {
    if (typeof value !== "string" || !value) throw new Error(`${label} is required`);
    return value;
}
