import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { sidebarStoreCreate } from "../sidebar/sidebarState.js";
import { chat } from "../../../tests/fixtures.js";
import { agentCreate } from "./chatActionsState.js";
import { agentEffortChange } from "./chatActionsState.js";
import { agentEffortLoad } from "./chatActionsState.js";
import { channelCreate } from "./chatActionsState.js";
import { channelUpdate } from "./chatActionsState.js";
import type { ChatActionContext } from "./chatActionsState.js";
import { chatJoin } from "./chatActionsState.js";
import { chatLeave } from "./chatActionsState.js";
import { chatReadMark } from "./chatActionsState.js";
import { chatStarSet } from "./chatActionsState.js";
import { directMessageCreate } from "./chatActionsState.js";
import { groupDirectMessageCreate } from "./chatActionsState.js";
import { typingSet } from "./chatActionsState.js";

describe("chat actions module", () => {
    it("routes every durable chat operation through one authoritative projection boundary", async () => {
        const summary = chat();
        const operation = vi.fn(async (name: string) => {
            if (name === "getAgentEffort" || name === "changeAgentEffort")
                return { agentUserId: "agent-1", effort: "high", options: ["low", "high"] };
            return { chat: summary };
        });
        const background = vi.fn((task: Promise<void>) => void task);
        const sidebar = sidebarStoreCreate();
        const chatInput = vi.fn();
        const context = {
            runtime: {
                operation,
                connected: true,
                active: true,
                background,
            } as unknown as StateRuntime,
            sidebar,
            chatGet: () => ({ getState: () => ({ chatInput }) }) as never,
            sidebarChatProject: async (value: typeof summary) => ({
                chat: value,
                id: value.id,
                displayName: value.name ?? value.id,
                participants: [],
            }),
        } satisfies ChatActionContext;
        await channelCreate(context, { name: "Channel", slug: "channel", kind: "private_channel" });
        await channelUpdate(context, summary.id, { topic: "Topic" });
        await directMessageCreate(context, "user-2");
        await groupDirectMessageCreate(context, ["user-2", "user-3"], "Group");
        await agentCreate(context, { name: "Agent", username: "agent" });
        await chatJoin(context, summary.id);
        await chatReadMark(context, summary.id, "message-1");
        await chatStarSet(context, summary.id, true);
        await agentEffortLoad(context, summary.id, "agent-1");
        await agentEffortChange(context, summary.id, "agent-1", "high");
        typingSet(context, summary.id, true);
        await chatLeave(context, summary.id);
        expect(operation.mock.calls.map(([name]) => name)).toEqual([
            "createChannel",
            "updateChannel",
            "createDirectMessage",
            "createGroupDirectMessage",
            "createAgent",
            "joinChat",
            "markChatRead",
            "setChatStar",
            "getAgentEffort",
            "changeAgentEffort",
            "setTyping",
            "leaveChat",
        ]);
        expect(chatInput).toHaveBeenCalledWith(
            expect.objectContaining({ type: "agentEffortLoaded" }),
        );
        expect(sidebar.getState().chats).toEqual([]);
    });

    it("projects effort failures only into a retained chat", async () => {
        const chatInput = vi.fn();
        const context = {
            runtime: {
                operation: vi.fn().mockRejectedValue(new Error("effort failed")),
            } as unknown as StateRuntime,
            sidebar: sidebarStoreCreate(),
            chatGet: () => ({ getState: () => ({ chatInput }) }),
            sidebarChatProject: vi.fn(),
        } as unknown as ChatActionContext;
        await agentEffortLoad(context, "chat-1", "agent-1");
        expect(chatInput).toHaveBeenCalledWith(
            expect.objectContaining({ type: "agentEffortFailed", agentUserId: "agent-1" }),
        );
    });
});
