import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { type PluginAppSummary, type PluginAppView, UserError } from "../../types.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    chatContributionsOpen,
    chatContributionsStoreCreate,
    pluginAppInstanceStoreCreate,
    pluginAppLoad,
    pluginAppOpen,
    pluginAppToolCall,
    pluginContributionOutputRoute,
    pluginNavigationLoad,
    pluginNavigationStoreCreate,
    pluginUiAssetRead,
} from "./pluginSurfacesState.js";

function app(overrides: Partial<PluginAppSummary> = {}): PluginAppSummary {
    return {
        id: "app-1",
        installationId: "installation-1",
        pluginId: "plugin-1",
        pluginShortName: "todos",
        instanceKey: "list-1",
        resourceUri: "ui://todos/list.html",
        title: "Roadmap",
        description: "A shared todo list",
        assetId: "todo",
        available: true,
        context: { dataRevision: 1, listId: "list-1" },
        dataRevision: 1,
        scope: "all_users",
        presentation: "sidebar",
        position: 0,
        revision: 1,
        hidden: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function view(overrides: Partial<PluginAppSummary> = {}): PluginAppView {
    const summary = app(overrides);
    return {
        app: summary,
        resource: {
            html: "<!doctype html><main id=app></main>",
            contentHashSha256: "a".repeat(64),
            csp: { connectDomains: [] },
            prefersBorder: true,
        },
        hostContext: {
            "happy2/instance": {
                id: summary.id,
                key: summary.instanceKey,
                context: summary.context,
                dataRevision: summary.dataRevision,
                definitionRevision: summary.revision,
            },
        },
    };
}

describe("plugin surfaces", () => {
    it("constructs stores without transport and preserves unchanged entity references", () => {
        const store = pluginNavigationStoreCreate();
        const first = app();
        store.getState().pluginNavigationInput({ type: "pluginAppsLoaded", apps: [first] });
        const apps = store.getState().apps;
        if (apps.type !== "ready") throw new Error("expected ready apps");
        const row = apps.value[0];
        let notifications = 0;
        const unsubscribe = store.subscribe(() => (notifications += 1));
        store.getState().pluginNavigationInput({ type: "pluginAppsLoaded", apps: [app()] });
        const next = store.getState().apps;
        expect(next.type).toBe("ready");
        if (next.type === "ready") {
            expect(next.value).toBe(apps.value);
            expect(next.value[0]).toBe(row);
        }
        expect(notifications).toBe(0);
        unsubscribe();

        store.getState().appPresentationUpdate("app-1", true);
        store.getState().appPresentationUpdate("app-1", false);
        store.getState().pluginNavigationInput({
            type: "appPresentationUpdateSucceeded",
            instanceId: "app-1",
            generation: 2,
            app: app({ hidden: false }),
        });
        store.getState().pluginNavigationInput({
            type: "appPresentationUpdateSucceeded",
            instanceId: "app-1",
            generation: 1,
            app: app({ hidden: true }),
        });
        const presented = store.getState().apps;
        expect(presented.type === "ready" && presented.value[0]?.hidden).toBe(false);
    });

    it("drops an older global list response when a newer reconciliation wins", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        let appsRequest = 0;
        server.route("GET", "/v0/apps", async () => {
            appsRequest += 1;
            if (appsRequest === 1) await new Promise<void>((resolve) => (releaseFirst = resolve));
            return jsonResponse(200, {
                apps: [app({ title: appsRequest === 1 ? "Old" : "New" })],
            });
        });
        server.respond(
            "GET",
            "/v0/contributions",
            jsonResponse(200, { contributions: [] }),
            jsonResponse(200, { contributions: [] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const store = pluginNavigationStoreCreate();
        const context = {
            runtime,
            pluginNavigationGet: () => store,
            chatContributionsGet: () => undefined,
        };
        const older = pluginNavigationLoad(context);
        await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
        await pluginNavigationLoad(context);
        releaseFirst();
        await older;
        const apps = store.getState().apps;
        expect(apps.type === "ready" && apps.value[0]?.title).toBe("New");
        runtime.stop();
    });

    it("surfaces independent app-list and contribution-list failures", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/apps", jsonResponse(503, { error: "not_ready" }));
        server.respond("GET", "/v0/contributions", jsonResponse(403, { error: "forbidden" }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const store = pluginNavigationStoreCreate();
        await pluginNavigationLoad({
            runtime,
            pluginNavigationGet: () => store,
            chatContributionsGet: () => undefined,
        });
        expect(store.getState().apps.type).toBe("error");
        expect(store.getState().contributions.type).toBe("error");
        runtime.stop();
    });

    it("keeps the latest async menu generation when completions arrive out of order", () => {
        const store = chatContributionsStoreCreate("chat-1");
        store.getState().pluginContributionMenuResolve("contribution-1", "message-1");
        store.getState().pluginContributionMenuResolve("contribution-1", "message-1");
        store.getState().chatContributionsInput({
            type: "pluginContributionMenuResolved",
            contributionId: "contribution-1",
            messageId: "message-1",
            generation: 2,
            revision: 2,
            items: [],
        });
        store.getState().chatContributionsInput({
            type: "pluginContributionMenuFailed",
            contributionId: "contribution-1",
            messageId: "message-1",
            generation: 1,
            error: new UserError("old failure"),
        });
        expect([...store.getState().menuStates.values()]).toEqual([
            { type: "ready", generation: 2, revision: 2, items: [] },
        ]);

        store.getState().pluginContributionInvoke({
            contributionId: "contribution-1",
            actionId: "create",
        });
        store.getState().pluginContributionInvoke({
            contributionId: "contribution-1",
            actionId: "create",
        });
        store.getState().chatContributionsInput({
            type: "pluginContributionInvokeSucceeded",
            contributionId: "contribution-1",
            actionId: "create",
            generation: 2,
            result: { result: { ok: true } },
        });
        store.getState().chatContributionsInput({
            type: "pluginContributionInvokeFailed",
            contributionId: "contribution-1",
            actionId: "create",
            generation: 1,
            error: new UserError("old failure"),
        });
        expect([...store.getState().actionStates.values()]).toEqual([
            { type: "succeeded", generation: 2, result: { result: { ok: true } } },
        ]);
    });

    it("invokes a typed chat action and exposes its app-opening result", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/contributions/contribution-1/invoke",
            jsonResponse(200, {
                result: { structuredContent: { created: true } },
                openApp: { instanceId: "app-1", presentation: "modal" },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const store = chatContributionsStoreCreate("chat-1");
        store.getState().pluginContributionInvoke({
            contributionId: "contribution-1",
            actionId: "create",
            value: "Ship it",
            messageId: "message-1",
        });
        const context = {
            runtime,
            pluginNavigationGet: () => undefined,
            chatContributionsGet: () => store,
        };
        await pluginContributionOutputRoute(context, {
            type: "pluginContributionInvokeSubmitted",
            chatId: "chat-1",
            contributionId: "contribution-1",
            actionId: "create",
            generation: 1,
            value: "Ship it",
            messageId: "message-1",
        });
        expect(server.requests[0]?.body).toEqual({
            actionId: "create",
            value: "Ship it",
            chatId: "chat-1",
            messageId: "message-1",
        });
        expect([...store.getState().actionStates.values()][0]).toMatchObject({
            type: "succeeded",
            result: { openApp: { instanceId: "app-1", presentation: "modal" } },
        });
        for (const [index, value] of [false, "", [] as readonly string[]].entries()) {
            store.getState().pluginContributionInvoke({
                contributionId: "contribution-1",
                actionId: "create",
                value,
                messageId: "message-1",
            });
            await pluginContributionOutputRoute(context, {
                type: "pluginContributionInvokeSubmitted",
                chatId: "chat-1",
                contributionId: "contribution-1",
                actionId: "create",
                generation: index + 2,
                value,
                messageId: "message-1",
            });
        }
        expect(server.requests.slice(1).map((request) => request.body)).toEqual([
            { actionId: "create", value: false, chatId: "chat-1", messageId: "message-1" },
            { actionId: "create", value: "", chatId: "chat-1", messageId: "message-1" },
            { actionId: "create", value: [], chatId: "chat-1", messageId: "message-1" },
        ]);
        runtime.stop();
    });

    it("keeps the app resource and store handle alive across data revisions", () => {
        const store = pluginAppInstanceStoreCreate("app-1");
        store.getState().pluginAppInput({ type: "pluginAppLoaded", view: view() });
        const first = store.getState().view;
        if (first.type !== "ready") throw new Error("expected ready app");
        const resource = first.value.resource;
        const hostContext = first.value.hostContext;
        store.getState().pluginAppInput({
            type: "pluginAppLoaded",
            view: view({
                context: { dataRevision: 2, listId: "list-1" },
                dataRevision: 2,
                updatedAt: "2026-01-02T00:00:00.000Z",
            }),
        });
        const next = store.getState().view;
        if (next.type !== "ready") throw new Error("expected ready app");
        expect(next.value.resource).toBe(resource);
        expect(next.value.hostContext).not.toBe(hostContext);
        expect(next.value.hostContext["happy2/instance"].dataRevision).toBe(2);
    });

    it("coalesces app invalidations and discards a completion after release", async () => {
        const server = createFakeServer();
        const releases: Array<() => void> = [];
        server.route("GET", "/v0/apps/app-1", async () => {
            await new Promise<void>((resolve) => releases.push(resolve));
            return jsonResponse(200, view());
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const store = pluginAppInstanceStoreCreate("app-1");
        let retained: typeof store | undefined = store;
        const context = { runtime, pluginAppGet: () => retained };
        const first = pluginAppLoad(context, "app-1");
        await vi.waitFor(() => expect(releases).toHaveLength(1));
        await Promise.all([pluginAppLoad(context, "app-1"), pluginAppLoad(context, "app-1")]);
        releases[0]!();
        await vi.waitFor(() => expect(releases).toHaveLength(2));
        retained = undefined;
        releases[1]!();
        await first;
        expect(server.requests).toHaveLength(2);
        expect(store.getState().view.type).toBe("ready");
        runtime.stop();
    });

    it("never retries non-idempotent durable app tool calls", async () => {
        const server = createFakeServer();
        let attempts = 0;
        server.route("POST", "/v0/apps/app-1/callTool", () => {
            attempts += 1;
            return jsonResponse(500, { error: "failed" });
        });
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 4 } });
        await expect(pluginAppToolCall(runtime, "app-1", "todo_create", {})).rejects.toMatchObject({
            name: "UserError",
        });
        expect(attempts).toBe(1);
        runtime.stop();
    });

    it("reads authenticated plugin icon bytes without exposing an asset URL", async () => {
        const server = createFakeServer();
        const png = new Uint8Array([137, 80, 78, 71]).buffer;
        server.respond("GET", "/v0/plugins/plugin-1/uiAssets/plus", {
            status: 200,
            body: png,
            headers: { "content-type": "image/png", etag: "digest" },
        });
        const runtime = new StateRuntime({ transport: server.transport });
        await expect(pluginUiAssetRead(runtime, "plugin-1", "plus")).resolves.toEqual(png);
        runtime.stop();
    });

    it("releases each app and chat surface lease exactly once", () => {
        const appStore = pluginAppInstanceStoreCreate("app-1");
        const appRelease = vi.fn();
        const appHandle = pluginAppOpen(
            {
                runtime: new StateRuntime({}),
                pluginAppAcquire: () => appStore,
                pluginAppRelease: appRelease,
                pluginAppGet: () => appStore,
                pluginAppLoad: vi.fn(),
                pluginAppToolCall: vi.fn(),
                pluginAppResourceRead: vi.fn(),
            },
            "app-1",
        );
        appHandle[Symbol.dispose]();
        appHandle[Symbol.dispose]();
        expect(appRelease).toHaveBeenCalledOnce();

        const chatStore = chatContributionsStoreCreate("chat-1");
        const chatRelease = vi.fn();
        const chatHandle = chatContributionsOpen(
            {
                runtime: new StateRuntime({}),
                navigation: undefined,
                pluginNavigationGet: () => undefined,
                chatContributionsGet: () => chatStore,
                chatContributionsAcquire: () => chatStore,
                chatContributionsRelease: chatRelease,
                chatContributionsLoad: vi.fn(),
            },
            "chat-1",
        );
        chatHandle[Symbol.dispose]();
        chatHandle[Symbol.dispose]();
        expect(chatRelease).toHaveBeenCalledOnce();
    });
});
