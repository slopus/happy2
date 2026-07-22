import { describe, expect, it } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";
import { message } from "./fixtures.js";

describe("channel composer audience routing", () => {
    it("submits the selected audience and agents, then preserves the detached composer", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/chats/chat-1/sendMessage",
            jsonResponse(201, {
                message: message({ audience: "agents", agentUserIds: ["agent-1", "agent-2"] }),
            }),
        );
        await using state = happyStateCreate({ transport: server.transport });

        const composer = state.composer("chat-1", { audience: "people" });
        expect(composer.getState().audience).toBe("people");
        composer.getState().audienceToggle();
        composer.getState().agentUserAdd("agent-2");
        composer.getState().textUpdate("run the deploy");
        composer.getState().textSubmit();
        await state.whenIdle();

        const send = server.requests.find((request) =>
            request.path.endsWith("/chat-1/sendMessage"),
        );
        expect(send?.body).toMatchObject({
            text: "run the deploy",
            audience: "agents",
            agentUserIds: ["agent-2"],
        });
        expect(composer.getState()).toMatchObject({
            text: "",
            audience: "agents",
            agentUserIds: ["agent-2"],
        });

        state.composerRelease("chat-1");
        const reopened = state.composer("chat-1", { audience: "people" });
        expect(reopened).toBe(composer);
        expect(reopened.getState()).toMatchObject({
            audience: "agents",
            agentUserIds: ["agent-2"],
        });

        reopened.getState().composerInput({ type: "agentUsersReconciled", agentUserIds: [] });
        state.composerRelease("chat-1");
        const reconciled = state.composer("chat-1", { audience: "people" });
        expect(reconciled.getState()).toMatchObject({ audience: "agents", agentUserIds: [] });
    });

    it("keeps the audience keys off the wire for a surface without audience routing", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/chats/dm-1/sendMessage",
            jsonResponse(201, { message: message({ chatId: "dm-1", audience: "agents" }) }),
        );
        await using state = happyStateCreate({ transport: server.transport });

        const composer = state.composer("dm-1");
        composer.getState().textUpdate("hello agent");
        composer.getState().textSubmit();
        await state.whenIdle();

        const send = server.requests.find((request) => request.path.endsWith("/dm-1/sendMessage"));
        expect(send?.body).toBeDefined();
        expect(Object.keys(send!.body as Record<string, unknown>)).not.toContain("audience");
        expect(Object.keys(send!.body as Record<string, unknown>)).not.toContain("agentUserIds");
    });
});
