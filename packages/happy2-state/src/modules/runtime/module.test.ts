import { describe, expect, it, vi } from "vitest";
import { TransportError } from "../../transport.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime, userError } from "./runtimeState.js";

describe("runtime module", () => {
    it("reuses one idempotency key, reports background errors, and stops retries", async () => {
        const server = createFakeServer();
        server.failNext("POST", "/v0/chats/chat-1/markRead", new TransportError("retry"));
        server.respond(
            "POST",
            "/v0/chats/chat-1/markRead",
            jsonResponse(200, { chat: { id: "chat-1" } }),
        );
        const background = vi.fn();
        const runtime = new StateRuntime({
            transport: server.transport,
            createId: () => "idempotency-1",
            sleep: async () => undefined,
            onBackgroundError: background,
        });
        await runtime.operation("markChatRead", { chatId: "chat-1" });
        expect(server.requests.map((request) => request.headers?.["idempotency-key"])).toEqual([
            "idempotency-1",
            "idempotency-1",
        ]);
        runtime.background(Promise.reject(new Error("background")));
        await runtime.whenIdle();
        expect(background).toHaveBeenCalledWith(expect.objectContaining({ message: "background" }));
        runtime.stop();
        await expect(runtime.operation("getChats")).rejects.toThrow("stopped");
        expect(userError("bad").message).toBe("The server request failed.");
    });
});
