import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { chat, message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { chatMembersLoad } from "./chatMembersLoad.js";
import { chatOutputRoute } from "./chatOutputRoute.js";
import { chatStoreCreateBinding } from "./chatStore.js";
import { messageItemProject } from "./messageProject.js";

describe("chat module", () => {
    it("owns every retained conversation resource in one coarse store", () => {
        const output = vi.fn();
        const binding = chatStoreCreateBinding("chat-1", output);
        binding.store.membersRetain();
        binding.store.membersRetain();
        binding.store.pinsRetain();
        binding.store.reactionActorsRetain("message-1", "emoji:👍");
        binding.store.agentEffortRetain("agent-1");
        binding.store.agentEffortChange("agent-1", "high");
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "membersRetained",
            "pinsRetained",
            "reactionActorsRetained",
            "agentEffortRetained",
            "agentEffortSubmitted",
        ]);

        const identities = new IdentityCatalog();
        const item = messageItemProject(identities, message());
        binding.chatInput({
            type: "chatLoaded",
            chat: chat(),
            messages: [item],
            hasMoreMessages: true,
        });
        const ready = binding.store.get();
        binding.chatInput({
            type: "messageUpserted",
            item: messageItemProject(identities, message()),
        });
        expect(binding.store.get()).toBe(ready);
        binding.chatInput({
            type: "membersLoaded",
            members: [
                {
                    id: "user-1",
                    username: "ada",
                    displayName: "Ada",
                    kind: "human",
                    role: "member",
                    presence: "online",
                },
            ],
        });
        binding.chatInput({ type: "pinsFailed", error: new UserError("pins") });
        binding.chatInput({
            type: "reactionActorsLoaded",
            details: { messageId: "message-1", reactionKey: "emoji:👍", actors: [] },
        });
        binding.chatInput({
            type: "typingReconciled",
            typing: [{ chatId: "chat-1", userId: "user-1", expiresAt: 10 }],
        });
        binding.chatInput({
            type: "agentActivityReconciled",
            agentActivity: [
                {
                    chatId: "chat-1",
                    agentUserId: "agent-1",
                    turnId: "turn-1",
                    phase: "thinking",
                    tokenCount: 1,
                    startedAt: 0,
                    expiresAt: 10,
                },
            ],
        });
        expect(binding.store.get()).toMatchObject({
            status: { type: "ready" },
            members: { type: "ready" },
            pins: { type: "error" },
            typing: [{ userId: "user-1" }],
            agentActivity: [{ agentUserId: "agent-1" }],
        });
        binding.chatInput({ type: "messageRemoved", messageId: "message-1" });
        expect(binding.store.get().messages).toEqual([]);
        binding.dispose();
        binding.store.membersRetain();
        expect(output).toHaveBeenCalledTimes(5);
    });

    it("loads canonical members and routes every retained-resource output", async () => {
        const binding = chatStoreCreateBinding("chat-1");
        binding.chatInput({
            type: "chatLoaded",
            chat: chat({ ownerUserId: "user-1" }),
            messages: [],
            hasMoreMessages: false,
        });
        const runtime = {
            connected: true,
            operation: vi.fn().mockResolvedValue({
                users: [
                    {
                        id: "user-1",
                        username: "ada",
                        firstName: "Ada",
                        role: "member",
                        kind: "human",
                    },
                ],
                memberships: [],
            }),
        } as unknown as StateRuntime;
        await chatMembersLoad(
            {
                runtime,
                identities: new IdentityCatalog(),
                chatGet: () => binding,
                presenceGet: () => ({ userId: "user-1", status: "online", connectionCount: 1 }),
            },
            "chat-1",
        );
        expect(binding.store.get().members).toMatchObject({
            type: "ready",
            value: [{ role: "owner", displayName: "Ada", presence: "online" }],
        });
        const context = {
            chatMembersLoad: vi.fn(),
            chatPinsLoad: vi.fn(),
            reactionActorsLoad: vi.fn(),
            agentEffortLoad: vi.fn(),
            agentEffortChange: vi.fn(),
        };
        chatOutputRoute(context, { type: "membersRetained", chatId: "chat-1" });
        chatOutputRoute(context, { type: "pinsRetained", chatId: "chat-1" });
        chatOutputRoute(context, {
            type: "reactionActorsRetained",
            chatId: "chat-1",
            messageId: "message-1",
            reactionKey: "emoji:👍",
        });
        chatOutputRoute(context, {
            type: "agentEffortRetained",
            chatId: "chat-1",
            agentUserId: "agent-1",
        });
        chatOutputRoute(context, {
            type: "agentEffortSubmitted",
            chatId: "chat-1",
            agentUserId: "agent-1",
            effort: "high",
        });
        expect(Object.values(context).every((listener) => listener.mock.calls.length === 1)).toBe(
            true,
        );
        binding.dispose();
    });
});
