import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { threadLoad } from "./threadState.js";
import { threadMessageSend } from "./threadState.js";
import { threadOpen } from "./threadState.js";
import { threadStoreCreate } from "./threadState.js";

describe("thread module", () => {
    it("loads and sends replies only into an already retained thread", async () => {
        const server = createFakeServer();
        const root = message();
        const reply = message({ id: "message-2", sequence: "2", threadRootMessageId: root.id });
        server.respond(
            "GET",
            "/v0/messages/message-1/thread?limit=100",
            jsonResponse(200, { root, messages: [reply], hasMore: false }),
        );
        server.respond(
            "POST",
            "/v0/messages/message-1/sendThreadMessage",
            jsonResponse(200, { message: { ...reply, id: "message-3", sequence: "3" } }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const output = vi.fn();
        const thread = threadStoreCreate(root.id, output);
        const context = { runtime, identities, threadGet: () => thread };
        await threadLoad(context, root.id);
        expect(thread.getState()).toMatchObject({
            root: { type: "ready", value: { id: "message-1" } },
            replies: [{ message: { id: "message-2" } }],
        });
        thread.getState().textSubmit({ text: "reply" });
        expect(output).toHaveBeenCalledWith(
            expect.objectContaining({ type: "threadReplySubmitted", rootMessageId: root.id }),
        );
        await threadMessageSend(context, root.id, { text: "reply" });
        expect(thread.getState().replies.map(({ message }) => message.id)).toEqual([
            "message-2",
            "message-3",
        ]);
        runtime.stop();
    });

    it("loads once per acquired lease and releases once per handle", () => {
        const thread = threadStoreCreate("message-1");
        const threadLoad = vi.fn();
        const threadRelease = vi.fn();
        const first = threadOpen(
            { threadAcquire: () => thread, threadRelease, threadLoad },
            "message-1",
        );
        expect(threadLoad).toHaveBeenCalledOnce();
        first[Symbol.dispose]();
        first[Symbol.dispose]();
        expect(threadRelease).toHaveBeenCalledOnce();
    });
});
