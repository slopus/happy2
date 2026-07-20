import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    documentListLoad,
    documentListStoreCreate,
    type DocumentListActionContext,
    type DocumentListStore,
} from "./documentListState.js";

const summary = (id: string, title: string) => ({
    id,
    chatId: "chat-1",
    title,
    format: "blocknote" as const,
    latestSequence: "0",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
});

function context(runtime: StateRuntime, store: DocumentListStore): DocumentListActionContext {
    return { runtime, documentListGet: (id) => (id === "chat-1" ? store : undefined) };
}

describe("document list store", () => {
    it("loads a channel's summaries and keeps shown rows through a failed refresh", async () => {
        const store = documentListStoreCreate("chat-1");
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/documents",
            jsonResponse(200, { documents: [summary("doc-1", "First")] }),
            jsonResponse(404, { error: "not_found", message: "Chat was not found" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, sleep: async () => {} });
        const actions = context(runtime, store);
        await documentListLoad(actions, "chat-1");
        expect(store.getState().documents).toEqual({
            type: "ready",
            value: [summary("doc-1", "First")],
        });
        await documentListLoad(actions, "chat-1");
        expect(store.getState().documents).toMatchObject({ type: "error" });
        runtime.stop();
    });

    it("coalesces a burst of loads into one request plus one trailing refetch", async () => {
        const store = documentListStoreCreate("chat-1");
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/documents",
            jsonResponse(200, { documents: [] }),
            jsonResponse(200, { documents: [summary("doc-2", "Second")] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const actions = context(runtime, store);
        const first = documentListLoad(actions, "chat-1");
        const second = documentListLoad(actions, "chat-1");
        const third = documentListLoad(actions, "chat-1");
        await Promise.all([first, second, third]);
        expect(server.requests).toHaveLength(2);
        expect(store.getState().documents).toEqual({
            type: "ready",
            value: [summary("doc-2", "Second")],
        });
        runtime.stop();
    });
});
