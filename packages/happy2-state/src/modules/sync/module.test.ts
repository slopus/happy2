import { describe, expect, it, vi } from "vitest";
import { areaReconcile, type AreaReconcileContext } from "./areaReconcile.js";
import { happyStateCreate } from "../../happyState.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { chat } from "../../../tests/fixtures.js";

describe("sync module", () => {
    it("routes every durable area to exactly one owner and exposes malformed/unknown areas", () => {
        const context: AreaReconcileContext = {
            chatReconcile: vi.fn(),
            workspaceReconcile: vi.fn(),
            callsReconcile: vi.fn(),
            threadsReconcile: vi.fn(),
            notificationsReconcile: vi.fn(),
            agentImagesReconcile: vi.fn(),
            setupReconcile: vi.fn(),
            agentSecretsReconcile: vi.fn(),
            identitiesReconcile: vi.fn(),
            unknownArea: vi.fn(),
        };
        for (const area of [
            "chat:chat-1",
            "workspace:chat-1",
            "calls",
            "call:call-1",
            "threads",
            "thread:message-1",
            "notifications",
            "agent-images",
            "setup",
            "user-onboarding",
            "agent-secrets",
            "users",
            "profile",
            "chat:",
            "unknown",
        ])
            areaReconcile(context, area);
        expect(context.chatReconcile).toHaveBeenCalledWith("chat-1");
        expect(context.workspaceReconcile).toHaveBeenCalledWith("chat-1");
        expect(context.callsReconcile).toHaveBeenCalledTimes(2);
        expect(context.threadsReconcile).toHaveBeenCalledTimes(2);
        expect(context.notificationsReconcile).toHaveBeenCalledOnce();
        expect(context.agentImagesReconcile).toHaveBeenCalledOnce();
        // "agent-images" also reconciles setup (shared build progress) plus the
        // dedicated "setup" and "user-onboarding" areas: three calls total.
        expect(context.setupReconcile).toHaveBeenCalledTimes(3);
        expect(context.agentSecretsReconcile).toHaveBeenCalledOnce();
        expect(context.identitiesReconcile).toHaveBeenCalledTimes(2);
        expect(context.unknownArea).toHaveBeenCalledTimes(2);
    });

    it("delivers and clears bounded ephemeral chat state across sync lifecycle", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
        );
        using state = happyStateCreate({ transport: server.transport, now: () => 0 });
        await state.syncStart();
        using surface = state.chatOpen("chat-1");
        await state.whenIdle();
        server.events.typing({ chatId: "chat-1", userId: "user-1", active: true, expiresAt: 100 });
        server.events.agentActivity({
            chatId: "chat-1",
            agentUserId: "agent-1",
            turnId: "turn-1",
            active: true,
            phase: "thinking",
            tokenCount: 1,
            startedAt: 0,
            expiresAt: 100,
        });
        expect(surface.get()).toMatchObject({
            typing: [{ userId: "user-1" }],
            agentActivity: [{ agentUserId: "agent-1" }],
        });
        state.syncStop();
        expect(surface.get()).toMatchObject({ typing: [], agentActivity: [] });
    });
});
