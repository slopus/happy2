import { describe, expect, it, vi } from "vitest";
import type { ChatSummary } from "../../types.js";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { sidebarStoreCreate } from "../sidebar/sidebarState.js";
import { chat } from "../../../tests/fixtures.js";
import { agentCreate } from "./chatActionsState.js";
import { agentEffortChange } from "./chatActionsState.js";
import { agentEffortLoad } from "./chatActionsState.js";
import { channelArchive } from "./chatActionsState.js";
import { channelCreate } from "./chatActionsState.js";
import { channelCreateChild } from "./chatActionsState.js";
import { channelUnarchive } from "./chatActionsState.js";
import { channelUpdate } from "./chatActionsState.js";
import type { ChatActionContext } from "./chatActionsState.js";
import { chatJoin } from "./chatActionsState.js";
import { chatLeave } from "./chatActionsState.js";
import { chatReadMark } from "./chatActionsState.js";
import { chatStarSet } from "./chatActionsState.js";
import { directMessageCreate } from "./chatActionsState.js";
import { groupDirectMessageCreate } from "./chatActionsState.js";
import { projectCreate } from "./chatActionsState.js";
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
        expect(operation).toHaveBeenCalledWith("getAgentEffort", {
            chatId: summary.id,
            agentUserId: "agent-1",
        });
        expect(operation).toHaveBeenCalledWith("changeAgentEffort", {
            chatId: summary.id,
            agentUserId: "agent-1",
            effort: "high",
        });
        expect(sidebar.getState().chats).toEqual([]);
    });

    it("maps child-channel creation and archive toggles onto their authoritative operations", async () => {
        const parent = chat({ id: "parent-1", name: "Parent", slug: "parent" });
        const child = chat({
            id: "child-1",
            name: "Child",
            slug: "child",
            parentChatId: parent.id,
            agentModelId: "gym/alternate-agent",
        });
        const operation = vi.fn(async (name: string) => {
            if (name === "createChildChannel") return { chat: child };
            return { chat: { ...parent, archivedAt: name === "archiveChannel" ? "t" : undefined } };
        });
        const upserts: unknown[] = [];
        const context = {
            runtime: { operation } as unknown as StateRuntime,
            sidebar: {
                getState: () => ({ sidebarInput: (event: unknown) => upserts.push(event) }),
            } as never,
            chatGet: () => undefined,
            sidebarChatProject: async (value: ChatSummary) => ({
                chat: value,
                id: value.id,
                displayName: value.name ?? value.id,
                participants: [],
            }),
        } satisfies ChatActionContext;
        await channelCreateChild(context, {
            parentChatId: parent.id,
            name: "Child",
            slug: "child",
            agentModelId: "gym/alternate-agent",
        });
        await channelArchive(context, child.id);
        await channelUnarchive(context, child.id);
        expect(operation.mock.calls).toEqual([
            [
                "createChildChannel",
                {
                    chatId: parent.id,
                    name: "Child",
                    slug: "child",
                    agentModelId: "gym/alternate-agent",
                },
            ],
            ["archiveChannel", { chatId: child.id }],
            ["unarchiveChannel", { chatId: child.id }],
        ]);
        expect(upserts[0]).toMatchObject({
            type: "chatSummaryUpserted",
            chat: {
                id: child.id,
                chat: { parentChatId: parent.id, agentModelId: "gym/alternate-agent" },
            },
        });
    });

    it("publishes an atomically created project and first channel into one sidebar snapshot", async () => {
        const summary = chat({ id: "channel-1", projectId: "project-1" });
        const project = {
            id: "project-1",
            name: "Launch",
            isDefault: false,
            syncSequence: "2",
            createdAt: "now",
            updatedAt: "now",
        };
        const operation = vi.fn().mockResolvedValue({ project, chat: summary });
        const sidebar = sidebarStoreCreate();
        const context = {
            runtime: { operation } as unknown as StateRuntime,
            sidebar,
            chatGet: () => undefined,
            sidebarChatProject: async (value: ChatSummary) => ({
                id: value.id,
                chat: value,
                displayName: value.name ?? value.id,
                participants: [],
            }),
        } satisfies ChatActionContext;

        await projectCreate(context, {
            name: "Launch",
            initialChannel: { kind: "private_channel", name: "Planning", slug: "planning" },
        });
        await projectCreate(context, {
            name: "Launch",
            initialChannel: { kind: "private_channel", name: "Planning", slug: "planning" },
        });

        expect(operation).toHaveBeenCalledTimes(2);
        expect(operation).toHaveBeenLastCalledWith("createProject", {
            name: "Launch",
            initialChannel: { kind: "private_channel", name: "Planning", slug: "planning" },
        });
        expect(sidebar.getState()).toMatchObject({
            projects: [{ id: "project-1" }],
            chats: [{ id: "channel-1", chat: { projectId: "project-1" } }],
        });
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
