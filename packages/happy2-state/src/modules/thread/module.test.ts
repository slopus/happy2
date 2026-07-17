import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { threadLoad } from "./threadLoad.js";
import { threadMessageSend } from "./threadMessageSend.js";
import { threadOpen } from "./threadOpen.js";
import { threadStoreCreateBinding } from "./threadStore.js";

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
        const thread = threadStoreCreateBinding(root.id, output);
        const context = { runtime, identities, threadGet: () => thread };
        await threadLoad(context, root.id);
        expect(thread.store.get()).toMatchObject({
            root: { type: "ready", value: { id: "message-1" } },
            replies: [{ message: { id: "message-2" } }],
        });
        thread.store.textSubmit({ text: "reply" });
        expect(output).toHaveBeenCalledWith(
            expect.objectContaining({ type: "textSubmitted", rootMessageId: root.id }),
        );
        await threadMessageSend(context, root.id, { text: "reply" });
        expect(thread.store.get().replies.map(({ message }) => message.id)).toEqual([
            "message-2",
            "message-3",
        ]);
        runtime.stop();
        thread.dispose();
        thread.store.textSubmit({ text: "ignored" });
        expect(output).toHaveBeenCalledTimes(1);
    });

    it("loads once per acquired lease and releases once per handle", () => {
        const thread = threadStoreCreateBinding("message-1");
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
        thread.dispose();
    });
});
