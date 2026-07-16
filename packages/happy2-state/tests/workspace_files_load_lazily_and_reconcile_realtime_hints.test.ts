import { describe, expect, it } from "vitest";
import { createClientState, type ClientStateEvent } from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";
import { chat } from "./fixtures";

describe("lazy chat workspace state", () => {
    it("loads only the adaptive preload and directory pages explicitly requested by the host", async () => {
        const server = createFakeServer();
        registerInitialState(server);
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace",
            workspaceResponse(
                {
                    paths: [".git/", "src/"],
                    gitStatus: [{ path: "src/", status: "modified" }],
                    revision: "r1",
                    unloadedDirectories: [".git/", "src/"],
                    gitStatusPending: false,
                },
                '"r1"',
            ),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace?directory=.git%2F",
            workspaceResponse({
                directory: ".git/",
                paths: [".git/HEAD", ".git/objects/"],
                gitStatus: [],
                revision: "r1",
                unloadedDirectories: [".git/objects/"],
                gitStatusPending: false,
                nextCursor: "git-cursor-1",
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace?directory=.git%2F&cursor=git-cursor-1",
            workspaceResponse({
                directory: ".git/",
                paths: [".git/index"],
                gitStatus: [],
                revision: "r1",
                unloadedDirectories: [],
                gitStatusPending: false,
            }),
        );
        await using state = createClientState(server.transport);
        await state.start();
        expect(server.requests.map(({ path }) => path)).toEqual(["/v0/sync/state", "/v0/chats"]);
        expect(state.get().workspacesByChat).toEqual({});

        const initial = await state.loadWorkspace("chat-1");
        expect(initial).toMatchObject({
            paths: [".git/", "src/"],
            unloadedDirectories: [".git/", "src/"],
            directories: [],
        });
        expect(Object.isFrozen(state.get().workspacesByChat["chat-1"])).toBe(true);

        const firstPage = await state.syncWorkspace("chat-1", [".git/"]);
        expect(firstPage).toMatchObject({
            requestedDirectories: [".git/"],
            paths: [".git/", ".git/HEAD", ".git/objects/", "src/"],
            unloadedDirectories: [".git/", ".git/objects/", "src/"],
            directories: [
                {
                    directory: ".git/",
                    loadedPathCount: 2,
                    pageCount: 1,
                    complete: false,
                },
            ],
        });
        await state.syncWorkspace("chat-1", [".git/"]);
        expect(
            server.requests.filter(({ path }) => path.includes("directory=.git%2F")),
        ).toHaveLength(1);

        const complete = await state.loadMoreWorkspaceDirectory("chat-1", ".git/");
        expect(complete).toMatchObject({
            paths: [".git/", ".git/HEAD", ".git/index", ".git/objects/", "src/"],
            unloadedDirectories: [".git/objects/", "src/"],
            directories: [
                {
                    directory: ".git/",
                    loadedPathCount: 3,
                    pageCount: 2,
                    complete: true,
                },
            ],
        });

        const collapsed = await state.syncWorkspace("chat-1", []);
        expect(collapsed).toMatchObject({
            requestedDirectories: [],
            paths: [".git/", "src/"],
            unloadedDirectories: [".git/", "src/"],
            directories: [],
        });
    });

    it("coalesces realtime hints and conditionally reconciles every materialized directory", async () => {
        const server = createFakeServer();
        registerInitialState(server);
        let changed = false;
        let conditionalRequests = 0;
        const reconcileStarted = deferred();
        const releaseReconcile = deferred();
        server.route(
            "GET",
            (path) => path.startsWith("/v0/chats/chat-1/workspace"),
            async (request) => {
                if (request.path.includes("directory=src%2F"))
                    return workspaceResponse({
                        directory: "src/",
                        paths: [changed ? "src/new.ts" : "src/old.ts"],
                        gitStatus: changed ? [{ path: "src/new.ts", status: "modified" }] : [],
                        revision: changed ? "r2" : "r1",
                        unloadedDirectories: [],
                        gitStatusPending: false,
                    });
                const etag = request.headers?.["if-none-match"];
                if (etag) {
                    conditionalRequests += 1;
                    if (conditionalRequests === 1) {
                        expect(etag).toBe('"r1"');
                        reconcileStarted.resolve();
                        await releaseReconcile.promise;
                    } else {
                        expect(etag).toBe('"r2"');
                        return { status: 304, body: {}, headers: { etag: '"r2"' } };
                    }
                }
                return workspaceResponse(
                    {
                        paths: ["src/"],
                        gitStatus: [],
                        revision: changed ? "r2" : "r1",
                        unloadedDirectories: ["src/"],
                        gitStatusPending: false,
                    },
                    changed ? '"r2"' : '"r1"',
                );
            },
        );

        await using state = createClientState(server.transport);
        await state.start();
        await state.loadWorkspace("chat-1");
        await state.syncWorkspace("chat-1", ["src/"]);
        const workspaceEvents: ClientStateEvent[] = [];
        state.subscribe("workspace", (event) => workspaceEvents.push(event));
        server.clearRequests();

        changed = true;
        server.events.workspaceChanged({ chatId: "chat-1", occurredAt: 1 });
        await reconcileStarted.promise;
        server.events.workspaceChanged({ chatId: "chat-1", occurredAt: 2 });
        releaseReconcile.resolve();
        await state.whenIdle();

        expect(state.get().workspacesByChat["chat-1"]).toMatchObject({
            paths: ["src/", "src/new.ts"],
            gitStatus: [{ path: "src/new.ts", status: "modified" }],
            revision: "r2",
        });
        expect(state.get().workspacesByChat["chat-1"]?.paths).not.toContain("src/old.ts");
        expect(conditionalRequests).toBe(2);
        expect(
            server.requests.filter(({ path }) => path.includes("directory=src%2F")),
        ).toHaveLength(1);
        expect(workspaceEvents.filter((event) => event.type === "workspace")).toEqual([
            { type: "workspace", reason: "sync", chatId: "chat-1", directories: ["src/"] },
        ]);
    });

    it("restarts directory pagination when a live tree change invalidates its cursor", async () => {
        const server = createFakeServer();
        let directoryStarts = 0;
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace",
            workspaceResponse({
                paths: ["generated/"],
                gitStatus: [],
                revision: "r1",
                unloadedDirectories: ["generated/"],
                gitStatusPending: false,
            }),
        );
        server.route(
            "GET",
            (path) => path.includes("directory=generated%2F"),
            (request) => {
                if (request.path.includes("cursor=stale"))
                    return jsonResponse(409, {
                        error: "workspace_cursor_stale",
                        message: "Workspace changed while the directory was being paged",
                    });
                if (request.path.includes("cursor=fresh"))
                    return workspaceResponse({
                        directory: "generated/",
                        paths: ["generated/d.txt"],
                        gitStatus: [],
                        revision: "r2",
                        unloadedDirectories: [],
                        gitStatusPending: false,
                    });
                directoryStarts += 1;
                return workspaceResponse({
                    directory: "generated/",
                    paths:
                        directoryStarts === 1
                            ? ["generated/a.txt", "generated/b.txt"]
                            : ["generated/a.txt", "generated/c.txt"],
                    gitStatus: [],
                    revision: directoryStarts === 1 ? "r1" : "r2",
                    unloadedDirectories: [],
                    gitStatusPending: false,
                    nextCursor: directoryStarts === 1 ? "stale" : "fresh",
                });
            },
        );

        await using state = createClientState(server.transport);
        await state.syncWorkspace("chat-1", ["generated/"]);
        const workspace = await state.loadMoreWorkspaceDirectory("chat-1", "generated/");

        expect(workspace.paths).toEqual([
            "generated/",
            "generated/a.txt",
            "generated/c.txt",
            "generated/d.txt",
        ]);
        expect(workspace.paths).not.toContain("generated/b.txt");
        expect(workspace.directories).toEqual([
            {
                directory: "generated/",
                loadedPathCount: 3,
                pageCount: 2,
                complete: true,
            },
        ]);
        expect(directoryStarts).toBe(2);
    });

    it("purges a materialized tree when durable sync removes channel membership", async () => {
        const server = createFakeServer();
        registerInitialState(server);
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace",
            workspaceResponse({
                paths: ["private.txt"],
                gitStatus: [],
                revision: "r1",
                unloadedDirectories: [],
                gitStatusPending: false,
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace/file?path=private.txt",
            jsonResponse(200, {
                file: { path: "private.txt", content: "private\n", size: 8, version: "v1" },
            }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: ["chat-1"],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );

        await using state = createClientState(server.transport);
        await state.start();
        await state.loadWorkspace("chat-1");
        await state.readWorkspaceFile("chat-1", "private.txt");
        const events: ClientStateEvent[] = [];
        state.subscribe("workspace", (event) => events.push(event));

        server.events.sync({ sequence: "1" });
        await state.whenIdle();

        expect(state.get().chats).toEqual([]);
        expect(state.get().workspacesByChat).toEqual({});
        expect(state.get().workspaceFilesByChat).toEqual({});
        expect(events).toEqual([
            { type: "workspace", reason: "removed", chatId: "chat-1", directories: [] },
        ]);
    });
});

function registerInitialState(server: ReturnType<typeof createFakeServer>): void {
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: "now",
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
}

function workspaceResponse(workspace: Record<string, unknown>, etag?: string) {
    return {
        ...jsonResponse(200, { workspace }),
        headers: { "content-type": "application/json", ...(etag ? { etag } : {}) },
    };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((next) => {
        resolve = next;
    });
    return { promise, resolve };
}
