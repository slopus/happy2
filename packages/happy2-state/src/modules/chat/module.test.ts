import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { chat, message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { composerStoreCreate } from "../composer/composerState.js";
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
                    subagents: [],
                    backgroundTerminals: [],
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
        const composer = composerStoreCreate("chat-1", {
            audience: "agents",
            agentUserIds: ["agent-removed"],
        });
        await chatMembersLoad(
            {
                runtime,
                identities: new IdentityCatalog(),
                chatGet: () => binding,
                composerGet: () => composer,
                presenceGet: () => ({ userId: "user-1", status: "online", connectionCount: 1 }),
            },
            "chat-1",
        );
        expect(binding.getState().members).toMatchObject({
            type: "ready",
            value: [{ role: "owner", displayName: "Ada", presence: "online" }],
        });
        expect(composer.getState().agentUserIds).toEqual([]);
    });

    it("reconciles a durable effort service message into only an already retained control", () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({
            type: "agentEffortLoaded",
            value: {
                agentUserId: "agent-1",
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
            },
        });
        const serviceItem = messageItemProject(
            new IdentityCatalog(),
            message({
                id: "effort-message-2",
                sequence: "2",
                kind: "automated",
                text: "@agent's reasoning effort changed to low",
                service: {
                    type: "agent_effort_changed",
                    agentUserId: "agent-1",
                    effort: "low",
                },
            }),
        );
        binding.getState().chatInput({ type: "messageUpserted", item: serviceItem });
        expect(binding.getState().agentEffort).toEqual({
            "agent-1": {
                type: "ready",
                value: {
                    agentUserId: "agent-1",
                    effort: "low",
                    options: ["low", "medium", "high", "xhigh"],
                },
            },
        });

        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(
                new IdentityCatalog(),
                message({
                    id: "effort-message-1",
                    sequence: "1",
                    kind: "automated",
                    text: "@agent's reasoning effort changed to medium",
                    service: {
                        type: "agent_effort_changed",
                        agentUserId: "agent-1",
                        effort: "medium",
                    },
                }),
            ),
        });
        expect(binding.getState().agentEffort["agent-1"]).toMatchObject({
            type: "ready",
            value: { effort: "low" },
        });

        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(
                new IdentityCatalog(),
                message({
                    id: "other-agent-effort",
                    sequence: "3",
                    kind: "automated",
                    service: {
                        type: "agent_effort_changed",
                        agentUserId: "agent-2",
                        effort: "xhigh",
                    },
                }),
            ),
        });
        expect(binding.getState().agentEffort["agent-2"]).toBeUndefined();
    });
});
