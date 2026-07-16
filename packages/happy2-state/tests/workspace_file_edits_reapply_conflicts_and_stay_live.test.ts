import { describe, expect, it } from "vitest";
import {
    createClientState,
    WorkspaceFileConflictError,
    type ClientStateEventOf,
    type WorkspaceTextFile,
} from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";
import { chat } from "./fixtures";

const filePath = "/v0/chats/chat-1/workspace/file?path=src%2Flive.ts";
const writePath = "/v0/chats/chat-1/workspace/writeFile";
const deletePath = "/v0/chats/chat-1/workspace/deleteFile";

describe("live conflict-safe workspace files", () => {
    it("reapplies a non-overlapping edit, keeps network retries idempotent, and refreshes open files", async () => {
        const server = initializedServer();
        let current = file("hello world\n", "v1");
        let writeAttempt = 0;
        let deleteAttempt = 0;
        server.route("GET", filePath, () => jsonResponse(200, { file: current }));
        server.route("POST", writePath, (request) => {
            writeAttempt += 1;
            if (writeAttempt === 1) {
                expect(request.body).toEqual({
                    path: "src/live.ts",
                    expectedVersion: "v1",
                    content: "hello codex\n",
                });
                return conflict("v2");
            }
            expect(request.body).toEqual({
                path: "src/live.ts",
                expectedVersion: "v2",
                patch: { edits: [{ start: 13, end: 18, text: "codex" }] },
            });
            current = file("header\nhello codex\n", "v3");
            return jsonResponse(200, {
                file: {
                    path: current.path,
                    size: current.size,
                    version: current.version,
                    created: false,
                },
            });
        });
        server.route("POST", deletePath, (request) => {
            deleteAttempt += 1;
            if (deleteAttempt === 1) {
                expect(request.body).toEqual({ path: current.path, expectedVersion: "v4" });
                current = file(current.content, "v5");
                return conflict("v5");
            }
            expect(request.body).toEqual({ path: current.path, expectedVersion: "v5" });
            return jsonResponse(200, {
                file: { path: current.path, deletedVersion: current.version },
            });
        });
        server.failNext("POST", writePath);
        const ids = ["write-1", "write-2", "delete-1", "delete-2"];
        await using state = createClientState(server.transport, {
            createId: () => ids.shift() ?? "unexpected-id",
            sleep: async () => undefined,
        });
        const events: ClientStateEventOf<"workspace-file">[] = [];
        state.subscribe("workspace-file", (event) => events.push(event));
        await state.start();

        const initial = await state.readWorkspaceFile("chat-1", "src/live.ts");
        expect(initial).toEqual(file("hello world\n", "v1"));
        current = file("header\nhello world\n", "v2");
        server.events.workspaceChanged({ chatId: "chat-1", occurredAt: 1 });
        await state.whenIdle();
        expect(state.get().workspaceFilesByChat["chat-1"]?.["src/live.ts"]).toEqual(current);

        const written = await state.writeWorkspaceFile("chat-1", {
            path: "src/live.ts",
            expectedVersion: initial.version,
            content: "hello codex\n",
        });

        expect(written).toEqual(file("header\nhello codex\n", "v3"));
        expect(state.get().workspaceFilesByChat["chat-1"]?.["src/live.ts"]).toEqual(written);
        expect(Object.isFrozen(written)).toBe(true);
        const writes = server.requests.filter(({ path }) => path === writePath);
        expect(writes.map(({ headers }) => headers?.["idempotency-key"])).toEqual([
            "write-1",
            "write-1",
            "write-2",
        ]);

        current = file("header\nhello codex live\n", "v4");
        server.events.workspaceChanged({ chatId: "chat-1", occurredAt: 2 });
        await state.whenIdle();
        expect(state.get().workspaceFilesByChat["chat-1"]?.["src/live.ts"]).toEqual(current);

        await state.deleteWorkspaceFile("chat-1", "src/live.ts", "v4");
        expect(state.get().workspaceFilesByChat).toEqual({});
        expect(
            server.requests
                .filter(({ path }) => path === deletePath)
                .map(({ headers }) => headers?.["idempotency-key"]),
        ).toEqual(["delete-1", "delete-2"]);
        expect(events.map((event) => event.reason)).toEqual([
            "read",
            "sync",
            "write",
            "sync",
            "conflict",
            "delete",
        ]);
    });

    it("surfaces a typed conflict instead of overwriting an overlapping external edit", async () => {
        const server = initializedServer();
        let current = file("abc", "v1");
        server.route("GET", filePath, () => jsonResponse(200, { file: current }));
        server.route("POST", writePath, () => {
            current = file("ayc", "v2");
            return conflict("v2");
        });
        await using state = createClientState(server.transport, {
            sleep: async () => undefined,
        });
        await state.start();
        const initial = await state.readWorkspaceFile("chat-1", "src/live.ts");

        const error = await state
            .writeWorkspaceFile("chat-1", {
                path: initial.path,
                expectedVersion: initial.version,
                patch: { edits: [{ start: 1, end: 2, text: "x" }] },
            })
            .catch((failure: unknown) => failure);

        expect(error).toBeInstanceOf(WorkspaceFileConflictError);
        expect(error).toMatchObject({
            code: "workspace_file_conflict",
            path: "src/live.ts",
            attemptedContent: "axc",
            currentFile: file("ayc", "v2"),
        });
        expect(state.get().workspaceFilesByChat["chat-1"]?.["src/live.ts"]).toEqual(current);
        expect(server.requests.filter(({ path }) => path === writePath)).toHaveLength(1);
    });

    it("creates a new file from an absent version", async () => {
        const server = initializedServer();
        server.respond(
            "POST",
            writePath,
            jsonResponse(201, {
                file: { path: "src/live.ts", size: 4, version: "v1", created: true },
            }),
        );
        await using state = createClientState(server.transport);
        await state.start();

        const created = await state.writeWorkspaceFile("chat-1", {
            path: "src/live.ts",
            expectedVersion: null,
            content: "new\n",
        });
        expect(created).toEqual(file("new\n", "v1"));
        expect(server.requests.at(-1)?.body).toEqual({
            path: "src/live.ts",
            expectedVersion: null,
            content: "new\n",
        });

        await state.unloadWorkspaceFile("chat-1", "src/live.ts");
        expect(state.get().workspaceFilesByChat).toEqual({});
        server.clearRequests();
        server.events.workspaceChanged({ chatId: "chat-1" });
        await state.whenIdle();
        expect(server.requests).toEqual([]);
    });
});

function initializedServer() {
    const server = createFakeServer();
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: "now",
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
    return server;
}

function file(content: string, version: string): WorkspaceTextFile {
    return {
        path: "src/live.ts",
        content,
        size: new TextEncoder().encode(content).byteLength,
        version,
    };
}

function conflict(currentVersion: string) {
    return jsonResponse(409, {
        error: "workspace_file_conflict",
        message: "Workspace file changed",
        currentVersion,
    });
}
