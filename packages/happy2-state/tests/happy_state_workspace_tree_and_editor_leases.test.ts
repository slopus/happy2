import { describe, expect, it } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";

describe("HappyState workspace tree and editor leases", () => {
    it("keeps tree and editor lifetimes independent and pages requested directories", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace",
            jsonResponse(200, {
                workspace: {
                    paths: ["src/"],
                    gitStatus: [],
                    revision: "1",
                    unloadedDirectories: ["src/"],
                    gitStatusPending: false,
                },
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace?directory=src%2F",
            jsonResponse(200, {
                workspace: {
                    directory: "src/",
                    paths: ["src/index.ts"],
                    gitStatus: [],
                    revision: "2",
                    unloadedDirectories: [],
                    gitStatusPending: false,
                },
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace/file?path=src%2Findex.ts",
            jsonResponse(200, {
                file: { path: "src/index.ts", content: "one", size: 3, version: "v1" },
            }),
        );
        using state = happyStateCreate({ transport: server.transport });
        using tree = state.workspaceOpen("chat-1");
        using file = state.workspaceFileOpen("chat-1", "src/index.ts");
        await state.whenIdle();
        tree.directoriesUpdate(["src/"]);
        await state.whenIdle();
        expect(tree.get().status).toMatchObject({
            type: "ready",
            value: { paths: ["src/", "src/index.ts"] },
        });
        file[Symbol.dispose]();
        expect(tree.get().status.type).toBe("ready");
        expect(file.get().content).toBe("one");
    });

    it("rebases a non-overlapping editor conflict and preserves one idempotency key per retry", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace/file?path=notes.txt",
            jsonResponse(200, {
                file: { path: "notes.txt", content: "alpha beta", size: 10, version: "v1" },
            }),
            jsonResponse(200, {
                file: { path: "notes.txt", content: "ALPHA beta", size: 10, version: "v2" },
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/workspace/writeFile",
            jsonResponse(409, { error: "workspace_file_conflict" }),
            jsonResponse(200, {
                file: { path: "notes.txt", size: 11, version: "v3", created: false },
            }),
        );
        using state = happyStateCreate({
            transport: server.transport,
            createId: (() => {
                let value = 0;
                return () => `key-${++value}`;
            })(),
        });
        using file = state.workspaceFileOpen("chat-1", "notes.txt");
        await state.whenIdle();
        file.contentUpdate("alpha beta!");
        file.contentSave();
        await state.whenIdle();
        expect(file.get()).toMatchObject({ content: "ALPHA beta!", saveState: { type: "clean" } });
        const writes = server.requests.filter(({ path }) => path.endsWith("/writeFile"));
        expect(writes).toHaveLength(2);
        expect(writes[0]?.headers?.["idempotency-key"]).toBeTruthy();
        expect(writes[1]?.headers?.["idempotency-key"]).toBeTruthy();
        expect(writes[1]?.headers?.["idempotency-key"]).toBe(
            writes[0]?.headers?.["idempotency-key"],
        );
    });
});
