import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { chat, message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { chatMembersLoad } from "./chatState.js";
import { chatStoreCreate } from "./chatState.js";
import { messageItemProject } from "./chatState.js";

describe("chat module", () => {
    it("owns every retained conversation resource in one coarse store", () => {
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        binding.getState().membersRetain();
        binding.getState().membersRetain();
        binding.getState().pinsRetain();
        binding.getState().reactionActorsRetain("message-1", "emoji:👍");
        binding.getState().agentEffortRetain("agent-1");
        binding.getState().agentEffortChange("agent-1", "high");
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "membersRetained",
            "pinsRetained",
            "reactionActorsRetained",
            "agentEffortRetained",
            "agentEffortSubmitted",
        ]);

        const identities = new IdentityCatalog();
        const item = messageItemProject(identities, message());
        binding.getState().chatInput({
            type: "chatLoaded",
            chat: chat(),
            messages: [item],
            hasMoreMessages: true,
        });
        const ready = binding.getState();
        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(identities, message()),
        });
        expect(binding.getState()).toBe(ready);
        binding.getState().chatInput({
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
        binding.getState().chatInput({ type: "pinsFailed", error: new UserError("pins") });
        binding.getState().chatInput({
            type: "reactionActorsLoaded",
            details: { messageId: "message-1", reactionKey: "emoji:👍", actors: [] },
        });
        binding.getState().chatInput({
            type: "typingReconciled",
            typing: [{ chatId: "chat-1", userId: "user-1", expiresAt: 10 }],
        });
        binding.getState().chatInput({
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
        expect(binding.getState()).toMatchObject({
            status: { type: "ready" },
            members: { type: "ready" },
            pins: { type: "error" },
            typing: [{ userId: "user-1" }],
            agentActivity: [{ agentUserId: "agent-1" }],
        });
        binding.getState().chatInput({ type: "messageRemoved", messageId: "message-1" });
        expect(binding.getState().messages).toEqual([]);
        binding.getState().membersRetain();
        expect(output).toHaveBeenCalledTimes(5);
    });

    it("loads canonical members into the retained store", async () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({
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
        expect(binding.getState().members).toMatchObject({
            type: "ready",
            value: [{ role: "owner", displayName: "Ada", presence: "online" }],
        });
    });
});
