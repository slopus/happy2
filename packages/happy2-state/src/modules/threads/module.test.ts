import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { chat, message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    threadsLoad,
    threadsOutputRoute,
    threadsStoreCreate,
    type ThreadsOutput,
} from "./threadsState.js";

describe("threads module", () => {
    it("projects child chats with fetched roots and paginates by stable child identity", async () => {
        const server = createFakeServer();
        const first = child("thread-1", "root-1");
        const second = child("thread-2", "root-2");
        server.respond(
            "GET",
            "/v0/threads?limit=100",
            jsonResponse(200, { threads: [first], nextCursor: first.id }),
        );
        server.respond(
            "GET",
            `/v0/threads?before=${first.id}&limit=100`,
            jsonResponse(200, { threads: [first, second] }),
        );
        server.respond(
            "GET",
            "/v0/messages/root-1",
            jsonResponse(200, {
                message: message({
                    id: "root-1",
                    text: "First root",
                    threadReplyCount: 2,
                    sender: {
                        id: "user-1",
                        username: "ada",
                        firstName: "Ada",
                        role: "member",
                        kind: "human",
                    },
                }),
            }),
        );
        server.respond(
            "GET",
            "/v0/messages/root-2",
            jsonResponse(200, { message: message({ id: "root-2", text: "Second root" }) }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = threadsStoreCreate();
        const context = { runtime, identities: new IdentityCatalog(), threads: binding };
        await threadsLoad(context);
        const firstProjection = ready(binding)[0]!;
        expect(firstProjection).toMatchObject({
            chat: { id: "thread-1", parentMessageId: "root-1" },
            root: { id: "root-1", sender: { displayName: "Ada" }, threadReplyCount: 2 },
        });
        await threadsLoad(context);
        expect(ready(binding)[0]).toBe(firstProjection);
        await threadsLoad(context, true);
        expect(ready(binding).map(({ chat }) => chat.id)).toEqual(["thread-1", "thread-2"]);
        expect(ready(binding)[0]).toBe(firstProjection);
        expect(binding.getState().nextCursor).toBeUndefined();
        runtime.stop();
    });

    it("uses ordinary child read and thread follow mutations before durable reload", async () => {
        const server = createFakeServer();
        const original = child("thread-1", "root-1", { unreadCount: 2 });
        const read = { ...original, unreadCount: 0 };
        server.respond(
            "GET",
            "/v0/threads?limit=100",
            jsonResponse(200, { threads: [original] }),
            jsonResponse(200, { threads: [read] }),
            jsonResponse(200, { threads: [] }),
        );
        server.respond(
            "GET",
            "/v0/messages/root-1",
            jsonResponse(200, { message: message({ id: "root-1" }) }),
        );
        server.respond("POST", "/v0/chats/thread-1/markRead", jsonResponse(200, { chat: read }));
        server.respond("POST", "/v0/chats/thread-1/updateThreadFollow", jsonResponse(200, {}));
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = threadsStoreCreate();
        const context = { runtime, identities: new IdentityCatalog(), threads: binding };
        await threadsLoad(context);
        await threadsOutputRoute(context, {
            type: "threadReadSubmitted",
            childChatId: "thread-1",
        });
        expect(ready(binding)[0]?.chat.unreadCount).toBe(0);
        await threadsOutputRoute(context, {
            type: "threadFollowSubmitted",
            childChatId: "thread-1",
            followed: false,
        });
        expect(ready(binding)).toEqual([]);
        expect(server.requests.map(({ path }) => path)).toContain(
            "/v0/chats/thread-1/updateThreadFollow",
        );
        runtime.stop();
    });

    it("emits closed entity-first intents for read, follow, pagination, and retry", () => {
        const output = vi.fn<(event: ThreadsOutput) => void>();
        const binding = threadsStoreCreate(output);
        binding.getState().threadsInput({
            type: "threadsLoaded",
            threads: [],
            nextCursor: "thread-1",
        });
        binding.getState().threadReadMark("thread-1");
        binding.getState().threadFollowSet("thread-1", false);
        binding.getState().threadsMore();
        binding.getState().threadsInput({
            type: "threadsFailed",
            error: new Error("offline") as never,
        });
        binding.getState().threadsRetry();
        expect(output.mock.calls.map(([event]) => event)).toEqual([
            { type: "threadReadSubmitted", childChatId: "thread-1" },
            { type: "threadFollowSubmitted", childChatId: "thread-1", followed: false },
            { type: "threadsMoreRequested" },
            { type: "threadsRefreshRequested" },
        ]);
    });

    it("surfaces initial, root, page, and action failures in their distinct states", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/threads?limit=100",
            jsonResponse(500, { message: "list offline" }),
            jsonResponse(200, { threads: [child("thread-1", "root-1")], nextCursor: "thread-1" }),
        );
        server.respond(
            "GET",
            "/v0/messages/root-1",
            jsonResponse(500, { message: "root offline" }),
        );
        server.respond(
            "GET",
            "/v0/threads?before=thread-1&limit=100",
            jsonResponse(500, { message: "page offline" }),
        );
        server.respond(
            "POST",
            "/v0/chats/thread-1/markRead",
            jsonResponse(500, { message: "read offline" }),
        );
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
        });
        const binding = threadsStoreCreate();
        const context = { runtime, identities: new IdentityCatalog(), threads: binding };
        await threadsLoad(context);
        expect(binding.getState().threads).toMatchObject({
            type: "error",
            error: { message: "list offline" },
        });
        await threadsLoad(context);
        expect(binding.getState().threads).toMatchObject({
            type: "error",
            error: { message: "root offline" },
        });

        binding.getState().threadsInput({
            type: "threadsLoaded",
            threads: [],
            nextCursor: "thread-1",
        });
        await threadsLoad(context, true);
        expect(binding.getState().pageError?.message).toBe("page offline");
        await threadsOutputRoute(context, {
            type: "threadReadSubmitted",
            childChatId: "thread-1",
        });
        expect(binding.getState().actionError?.message).toBe("read offline");
        runtime.stop();
    });
});

function child(id: string, parentMessageId: string, overrides = {}) {
    return chat({ id, parentMessageId, followed: true, ...overrides });
}

function ready(binding: ReturnType<typeof threadsStoreCreate>) {
    const threads = binding.getState().threads;
    if (threads.type !== "ready") throw new Error(`Expected ready threads, got ${threads.type}`);
    return threads.value;
}
