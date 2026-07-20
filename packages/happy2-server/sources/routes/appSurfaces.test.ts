import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../modules/auth/service.js";
import type { PluginService } from "../modules/plugin/service.js";
import { registerAppSurfaceRoutes } from "./appSurfaces.js";

describe("plugin app surface routes", () => {
    let app: FastifyInstance;
    const plugins = {
        listAppInstances: vi.fn(async () => [{ id: "app-1" }]),
        getAppInstance: vi.fn(async () => ({ app: { id: "app-1" } })),
        callAppInstanceTool: vi.fn(async () => ({ structuredContent: { ok: true } })),
        readAppInstanceResource: vi.fn(async () => ({ contents: [] })),
        listContributions: vi.fn(async () => [{ id: "contribution-1" }]),
        invokeContribution: vi.fn(async () => ({ result: { structuredContent: { ok: true } } })),
        resolveContributionMenu: vi.fn(async () => ({ items: [], revision: 2 })),
        updateAppPresentation: vi.fn(async () => ({ app: { id: "app-1" }, sync: {} })),
        getUiAsset: vi.fn(async () => ({
            body: Buffer.from([137, 80, 78, 71]),
            contentType: "image/png",
            checksumSha256: "a".repeat(64),
        })),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        app = Fastify({ logger: false });
        registerAppSurfaceRoutes(
            app,
            {
                async authenticate(request) {
                    if (request.headers.authorization !== "Bearer valid") return undefined;
                    return { user: { id: "user-1" } } as never;
                },
            } as AuthService,
            plugins as unknown as PluginService,
        );
    });

    afterEach(async () => app.close());

    it("authenticates and exposes exact app, contribution, and asset response envelopes", async () => {
        expect((await app.inject({ method: "GET", url: "/v0/apps" })).statusCode).toBe(401);
        const headers = { authorization: "Bearer valid" };
        const apps = await app.inject({ method: "GET", url: "/v0/apps", headers });
        expect(apps.json()).toEqual({ apps: [{ id: "app-1" }] });

        const called = await app.inject({
            method: "POST",
            url: "/v0/apps/app-1/callTool",
            headers,
            payload: { name: "todo_create", arguments: { title: "Ship" } },
        });
        expect(called.json()).toEqual({ result: { structuredContent: { ok: true } } });
        expect(plugins.callAppInstanceTool).toHaveBeenCalledWith({
            viewerUserId: "user-1",
            instanceId: "app-1",
            toolName: "todo_create",
            arguments: { title: "Ship" },
        });

        const invoked = await app.inject({
            method: "POST",
            url: "/v0/contributions/contribution-1/invoke",
            headers,
            payload: { actionId: "create", chatId: "chat-1" },
        });
        expect(invoked.json()).toEqual({ result: { structuredContent: { ok: true } } });
        expect(plugins.invokeContribution).toHaveBeenCalledWith({
            viewerUserId: "user-1",
            contributionId: "contribution-1",
            actionId: "create",
            chatId: "chat-1",
        });

        const asset = await app.inject({
            method: "GET",
            url: "/v0/pluginInstallations/installation-1/uiAssets/todo-mark",
            headers,
        });
        expect(asset.statusCode).toBe(200);
        expect(asset.headers.etag).toBe(`"${"a".repeat(64)}"`);
        expect(asset.headers["content-type"]).toBe("image/png");
        expect(asset.rawPayload).toEqual(Buffer.from([137, 80, 78, 71]));
    });

    it("rejects unknown and malformed product-route input before service execution", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/v0/apps/app-1/callTool",
            headers: { authorization: "Bearer valid" },
            payload: { name: "todo_create", arguments: {}, installationId: "attacker" },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: "invalid_request" });
        expect(plugins.callAppInstanceTool).not.toHaveBeenCalled();
    });
});
