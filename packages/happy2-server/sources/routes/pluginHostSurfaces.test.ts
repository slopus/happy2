import { afterEach, describe, expect, it, vi } from "vitest";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import type { PluginService } from "../modules/plugin/service.js";
import { createPluginHostApi } from "./pluginHost.js";

describe("plugin host surface routes", () => {
    const apps: ReturnType<typeof createPluginHostApi>[] = [];
    afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

    it("uses the SDK's canonical paths and forwards scoped capability headers", async () => {
        const put = vi.fn(async () => ({ created: true, id: "app-1" }));
        const plugins = {
            hostAppInstancePut: put,
        } as unknown as PluginService;
        const app = createPluginHostApi({} as DrizzleExecutor, plugins, false);
        apps.push(app);
        const response = await app.inject({
            method: "POST",
            url: "/apps/putInstance",
            headers: {
                authorization: "Bearer runtime",
                "x-happy2-viewer-token": "viewer",
                "x-happy2-chat-token": "chat",
            },
            payload: {
                instanceKey: "todos:index",
                resourceUri: "ui://todos/index",
                audience: { scope: "user" },
            },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ created: true, id: "app-1" });
        expect(put).toHaveBeenCalledWith({
            runtimeToken: "runtime",
            viewerToken: "viewer",
            chatToken: "chat",
            definition: {
                instanceKey: "todos:index",
                resourceUri: "ui://todos/index",
                audience: { scope: "user" },
            },
        });
        expect(
            (
                await app.inject({
                    method: "POST",
                    url: "/apps/putAppInstance",
                    headers: { authorization: "Bearer runtime" },
                    payload: {},
                })
            ).statusCode,
        ).toBe(404);
    });
});
