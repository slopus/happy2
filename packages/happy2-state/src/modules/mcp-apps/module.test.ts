import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import type { McpAppView } from "../../types.js";
import { UserError } from "../../types.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    mcpAppLoad,
    mcpAppOpen,
    mcpAppResourceRead,
    mcpAppStoreCreate,
    mcpAppToolCall,
} from "./mcpAppState.js";

function view(overrides: Partial<McpAppView["app"]> = {}): McpAppView {
    return {
        app: {
            callId: "call-1",
            toolName: "movie_show",
            resourceUri: "ui://movie-catalog/movie.html",
            arguments: { query: "matrix" },
            status: "completed",
            result: { content: [{ type: "text", text: "The Matrix (1999)" }] },
            ...overrides,
        },
        resource: {
            html: "<!doctype html><title>Movie catalog</title><main id=app></main>",
            contentHashSha256: "a".repeat(64),
            meta: {
                ui: {
                    csp: { connectDomains: [], resourceDomains: [] },
                    permissions: { clipboardWrite: {} },
                    prefersBorder: true,
                },
            },
        },
    };
}

const APP_PATH = "/v0/messages/message-1/mcpApps/call-1";

describe("mcp-apps module", () => {
    it("loads a snapshotted app view into a retained surface", async () => {
        const server = createFakeServer();
        server.respond("GET", APP_PATH, jsonResponse(200, view()));
        const runtime = new StateRuntime({ transport: server.transport });
        const store = mcpAppStoreCreate("message-1", "call-1");
        const context = { runtime, mcpAppGet: () => store };
        await mcpAppLoad(context, "message-1", "call-1");
        expect(store.getState().view).toMatchObject({
            type: "ready",
            value: {
                app: { callId: "call-1", toolName: "movie_show", status: "completed" },
                resource: { meta: { ui: { prefersBorder: true } } },
            },
        });
        runtime.stop();
    });

    it("surfaces a load failure as an error snapshot without throwing", async () => {
        const server = createFakeServer();
        server.respond("GET", APP_PATH, jsonResponse(404, { error: "not_found" }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const store = mcpAppStoreCreate("message-1", "call-1");
        await mcpAppLoad({ runtime, mcpAppGet: () => store }, "message-1", "call-1");
        expect(store.getState().view.type).toBe("error");
        runtime.stop();
    });

    it("keeps a ready view during a refresh and applies the newer status", async () => {
        const server = createFakeServer();
        let release!: () => void;
        let requestCount = 0;
        server.route("GET", APP_PATH, async () => {
            requestCount += 1;
            if (requestCount === 1) return jsonResponse(200, view({ status: "in_progress" }));
            await new Promise<void>((resolve) => (release = resolve));
            return jsonResponse(200, view({ status: "completed" }));
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const store = mcpAppStoreCreate("message-1", "call-1");
        const context = { runtime, mcpAppGet: () => store };
        await mcpAppLoad(context, "message-1", "call-1");
        expect(store.getState().view).toMatchObject({
            type: "ready",
            value: { app: { status: "in_progress" } },
        });
        const refreshing = mcpAppLoad(context, "message-1", "call-1");
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        expect(store.getState().view).toMatchObject({
            type: "ready",
            value: { app: { status: "in_progress" } },
        });
        release();
        await refreshing;
        expect(store.getState().view).toMatchObject({
            type: "ready",
            value: { app: { status: "completed" } },
        });
        runtime.stop();
    });

    it("coalesces a burst of loads into one in-flight request plus one trailing refetch", async () => {
        const server = createFakeServer();
        const releases: Array<() => void> = [];
        let requestCount = 0;
        server.route("GET", APP_PATH, async () => {
            requestCount += 1;
            await new Promise<void>((resolve) => releases.push(resolve));
            return jsonResponse(200, view());
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const store = mcpAppStoreCreate("message-1", "call-1");
        const context = { runtime, mcpAppGet: () => store };
        const first = mcpAppLoad(context, "message-1", "call-1");
        await vi.waitFor(() => expect(releases).toHaveLength(1));
        await Promise.all([
            mcpAppLoad(context, "message-1", "call-1"),
            mcpAppLoad(context, "message-1", "call-1"),
            mcpAppLoad(context, "message-1", "call-1"),
        ]);
        expect(requestCount).toBe(1);
        releases[0]!();
        await vi.waitFor(() => expect(releases).toHaveLength(2));
        releases[1]!();
        await first;
        expect(requestCount).toBe(2);
        runtime.stop();
    });

    it("drops a late completion after the final lease closes", async () => {
        const server = createFakeServer();
        let release!: () => void;
        server.route("GET", APP_PATH, async () => {
            await new Promise<void>((resolve) => (release = resolve));
            return jsonResponse(200, view());
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const store = mcpAppStoreCreate("message-1", "call-1");
        let retained: typeof store | undefined = store;
        const loading = mcpAppLoad({ runtime, mcpAppGet: () => retained }, "message-1", "call-1");
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        retained = undefined;
        release();
        await loading;
        expect(store.getState().view.type).toBe("loading");
        runtime.stop();
    });

    it("proxies an app-initiated tool call and returns its raw result", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            `${APP_PATH}/callTool`,
            jsonResponse(200, {
                result: { content: [{ type: "text", text: "Arrival (2016)" }] },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const result = await mcpAppToolCall(runtime, "message-1", "call-1", "movie_next", {
            position: 0,
        });
        expect(result).toMatchObject({ content: [{ type: "text", text: "Arrival (2016)" }] });
        const request = server.requests.at(-1)!;
        expect(request.body).toMatchObject({ name: "movie_next", arguments: { position: 0 } });
        runtime.stop();
    });

    it("rejects a forbidden tool call with a displayable UserError", async () => {
        const server = createFakeServer();
        server.respond("POST", `${APP_PATH}/callTool`, jsonResponse(403, { error: "forbidden" }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        await expect(
            mcpAppToolCall(runtime, "message-1", "call-1", "movie_model_notes", {}),
        ).rejects.toBeInstanceOf(UserError);
        runtime.stop();
    });

    it("proxies an app-initiated resource read and returns its raw contents", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            `${APP_PATH}/readResource`,
            jsonResponse(200, {
                result: { contents: [{ uri: "ui://movie-catalog/movie.html" }] },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const result = await mcpAppResourceRead(
            runtime,
            "message-1",
            "call-1",
            "ui://movie-catalog/movie.html",
        );
        expect(result).toMatchObject({ contents: [{ uri: "ui://movie-catalog/movie.html" }] });
        runtime.stop();
    });

    it("does not retry a failed tool call so a non-idempotent tool runs at most once", async () => {
        const server = createFakeServer();
        let attempts = 0;
        server.route("POST", `${APP_PATH}/callTool`, async () => {
            attempts += 1;
            return jsonResponse(500, { error: "server_error" });
        });
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 5 } });
        await expect(
            mcpAppToolCall(runtime, "message-1", "call-1", "movie_next", { position: 0 }),
        ).rejects.toBeInstanceOf(UserError);
        expect(attempts).toBe(1);
        runtime.stop();
    });

    it("opens once per acquired lease, wires bridge actions, and releases once per handle", () => {
        const store = mcpAppStoreCreate("message-1", "call-1");
        const load = vi.fn();
        const release = vi.fn();
        const toolCall = vi.fn(async () => ({ ok: true }));
        const resourceRead = vi.fn(async () => ({ contents: [] }));
        const handle = mcpAppOpen(
            {
                mcpAppAcquire: () => store,
                mcpAppRelease: release,
                mcpAppLoad: load,
                mcpAppToolCall: toolCall,
                mcpAppResourceRead: resourceRead,
            },
            "message-1",
            "call-1",
        );
        expect(load).toHaveBeenCalledOnce();
        void handle.mcpAppToolCall("movie_next", { position: 0 });
        void handle.mcpAppResourceRead("ui://movie-catalog/movie.html");
        handle.mcpAppReload();
        expect(toolCall).toHaveBeenCalledWith("message-1", "call-1", "movie_next", { position: 0 });
        expect(resourceRead).toHaveBeenCalledWith(
            "message-1",
            "call-1",
            "ui://movie-catalog/movie.html",
        );
        expect(load).toHaveBeenCalledTimes(2);
        handle[Symbol.dispose]();
        handle[Symbol.dispose]();
        expect(release).toHaveBeenCalledOnce();
    });
});
