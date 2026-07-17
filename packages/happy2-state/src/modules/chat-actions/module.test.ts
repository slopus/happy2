import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { sidebarStoreCreateBinding } from "../sidebar/sidebarStore.js";
import { chat } from "../../../tests/fixtures.js";
import { agentCreate } from "./agentCreate.js";
import { agentEffortChange } from "./agentEffortChange.js";
import { agentEffortLoad } from "./agentEffortLoad.js";
import { channelCreate } from "./channelCreate.js";
import { channelUpdate } from "./channelUpdate.js";
import type { ChatActionContext } from "./chatActionContext.js";
import { chatJoin } from "./chatJoin.js";
import { chatLeave } from "./chatLeave.js";
import { chatReadMark } from "./chatReadMark.js";
import { chatStarSet } from "./chatStarSet.js";
import { directMessageCreate } from "./directMessageCreate.js";
import { groupDirectMessageCreate } from "./groupDirectMessageCreate.js";
import { typingSet } from "./typingSet.js";

describe("chat actions module", () => {
    it("routes every durable chat operation through one authoritative projection boundary", async () => {
        const summary = chat();
        const operation = vi.fn(async (name: string) => {
            if (name === "getAgentEffort" || name === "changeAgentEffort")
                return { agentUserId: "agent-1", effort: "high", options: ["low", "high"] };
            return { chat: summary };
        });
        const background = vi.fn((task: Promise<void>) => void task);
        const sidebar = sidebarStoreCreateBinding();
        const chatInput = vi.fn();
        const context = {
            runtime: {
                operation,
                connected: true,
                active: true,
                background,
            } as unknown as StateRuntime,
            sidebar,
            chatGet: () => ({ chatInput }) as never,
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
        expect(sidebar.store.get().chats).toEqual([]);
        sidebar.dispose();
    });

    it("projects effort failures only into a retained chat", async () => {
        const chatInput = vi.fn();
        const context = {
            runtime: {
                operation: vi.fn().mockRejectedValue(new Error("effort failed")),
            } as unknown as StateRuntime,
            sidebar: sidebarStoreCreateBinding(),
            chatGet: () => ({ chatInput }),
            sidebarChatProject: vi.fn(),
        } as unknown as ChatActionContext;
        await agentEffortLoad(context, "chat-1", "agent-1");
        expect(chatInput).toHaveBeenCalledWith(
            expect.objectContaining({ type: "agentEffortFailed", agentUserId: "agent-1" }),
        );
        context.sidebar.dispose();
    });
});
