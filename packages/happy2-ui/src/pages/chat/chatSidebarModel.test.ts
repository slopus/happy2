import { createRoot, createSignal } from "solid-js";
import type {
    ChatSummary,
    DirectorySnapshot,
    IdentityProjection,
    SidebarChatProjection,
    SidebarSnapshot,
} from "happy2-state";
import { expect, it } from "vitest";
import { chatSidebarModelCreate } from "./chatSidebarModel";

const human: IdentityProjection = {
    id: "human-2",
    displayName: "Grace Hopper",
    username: "grace",
    kind: "human",
};
const agent: IdentityProjection = {
    id: "agent-2",
    displayName: "Build agent",
    username: "build-agent",
    kind: "agent",
};
const happy: IdentityProjection = {
    id: "happy",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};

function chat(
    id: string,
    kind: ChatSummary["kind"],
    values: Partial<ChatSummary> = {},
): ChatSummary {
    return {
        id,
        kind,
        isListed: kind !== "dm",
        isMain: false,
        autoJoin: false,
        isPinnedHappy: false,
        retentionMode: "inherit",
        defaultExpiryMode: "none",
        defaultAfterReadScope: "all_readers",
        lifecycleVersion: "1",
        createdByUserId: "human-1",
        pts: "0",
        lastMessageSequence: "0",
        membershipEpoch: "1",
        membershipRole: "member",
        starred: false,
        lastReadSequence: "0",
        unreadCount: 0,
        mentionCount: 0,
        notificationLevel: "all",
        createdAt: "2026-07-17T12:00:00.000Z",
        updatedAt: "2026-07-17T12:00:00.000Z",
        ...values,
    };
}

function projection(summary: ChatSummary, displayName: string, peer?: IdentityProjection) {
    return {
        id: summary.id,
        chat: summary,
        displayName,
        participants: peer
            ? [
                  {
                      id: "human-1",
                      displayName: "Ada Lovelace",
                      username: "ada",
                      kind: "human" as const,
                  },
                  peer,
              ]
            : [],
    } satisfies SidebarChatProjection;
}

it("pins Happy and projects channels, people, then agents with distinct unread signals", () => {
    createRoot((dispose) => {
        const pinned = projection(
            chat("happy-chat", "dm", { isPinnedHappy: true, unreadCount: 3, mentionCount: 1 }),
            "Happy",
            happy,
        );
        const agentChat = projection(
            chat("agent-chat", "dm", { unreadCount: 5, mentionCount: 2 }),
            "Build agent",
            agent,
        );
        const humanChat = projection(
            chat("human-chat", "dm", { unreadCount: 4 }),
            "Grace Hopper",
            human,
        );
        const channel = projection(
            chat("channel", "public_channel", { name: "Engineering", starred: true }),
            "Engineering",
        );
        const [activeId, setActiveId] = createSignal("");
        const [sidebar, setSidebar] = createSignal<SidebarSnapshot>({
            status: { type: "ready" },
            chats: [agentChat, pinned, humanChat, channel],
        });
        const directory: DirectorySnapshot = {
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        };
        const model = chatSidebarModelCreate({
            user: () => ({ id: "human-1", firstName: "Ada" }),
            activeConversationId: activeId,
            search: () => "",
            sidebarSnapshot: sidebar,
            directorySnapshot: () => directory,
            avatarFor: () => undefined,
        });

        expect(model.pinnedItems().map((item) => item.label)).toEqual(["Happy"]);
        expect(model.sections().map((section) => section.id)).toEqual([
            "channels",
            "dms",
            "agents",
        ]);
        expect(model.sections().map((section) => section.items.map((item) => item.label))).toEqual([
            ["Engineering"],
            ["Grace Hopper"],
            ["Build agent"],
        ]);
        const humanItem = model.sections()[1]!.items[0]!;
        const agentItem = model.sections()[2]!.items[0]!;
        expect({ unread: humanItem.unread, badge: humanItem.badge }).toEqual({
            unread: true,
            badge: undefined,
        });
        expect({ unread: agentItem.unread, badge: agentItem.badge }).toEqual({
            unread: true,
            badge: 2,
        });

        setActiveId("agent-chat");
        expect({ unread: agentItem.unread, badge: agentItem.badge }).toEqual({
            unread: false,
            badge: undefined,
        });
        const changedAgent = projection(
            { ...agentChat.chat, unreadCount: 8, mentionCount: 3 },
            "Release agent",
            agent,
        );
        setActiveId("");
        setSidebar({
            status: { type: "ready" },
            chats: [changedAgent, pinned, humanChat, channel],
        });
        const updatedAgentItem = model.sections()[2]!.items[0]!;
        expect(updatedAgentItem).toBe(agentItem);
        expect({
            label: updatedAgentItem.label,
            unread: updatedAgentItem.unread,
            badge: updatedAgentItem.badge,
        }).toEqual({
            label: "Release agent",
            unread: true,
            badge: 3,
        });
        dispose();
    });
});
