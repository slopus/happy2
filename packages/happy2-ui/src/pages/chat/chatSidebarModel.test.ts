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
        isDefaultAgentConversation: false,
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
        followed: false,
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
it("places the default-agent conversation in the agents section and projects distinct unread signals", () => {
    const defaultAgentChat = projection(
        chat("happy-chat", "dm", {
            isDefaultAgentConversation: true,
            unreadCount: 3,
            mentionCount: 1,
        }),
        "Happy",
        happy,
    );
    const agentChat = projection(
        chat("agent-chat", "dm", { unreadCount: 5, mentionCount: 2 }),
        "Build agent",
        agent,
    );
    const secondAgentChat = projection(chat("second-agent-chat", "dm"), "Review agent", agent);
    const humanChat = projection(
        chat("human-chat", "dm", { unreadCount: 4 }),
        "Grace Hopper",
        human,
    );
    const channel = projection(
        chat("channel", "public_channel", { name: "Engineering", starred: true }),
        "Engineering",
    );
    let activeId = "";
    let sidebar: SidebarSnapshot = {
        status: { type: "ready" },
        chats: [agentChat, secondAgentChat, defaultAgentChat, humanChat, channel],
    };
    const directory: DirectorySnapshot = {
        status: { type: "ready", value: true },
        users: [],
        channels: [],
    };
    const createModel = () =>
        chatSidebarModelCreate({
            user: () => ({ id: "human-1", firstName: "Ada" }),
            activeConversationId: () => activeId,
            search: () => "",
            sidebarSnapshot: () => sidebar,
            directorySnapshot: () => directory,
            avatarFor: () => undefined,
        });
    let model = createModel();
    // The default-agent conversation is a normal DM-with-agent row inside the
    // agents section; there is no privileged pinned row above the sections.
    expect("pinnedItems" in model).toBe(false);
    expect(model.sections.map((section) => section.id)).toEqual(["channels", "dms", "agents"]);
    expect(model.sections.map((section) => section.items.map((item) => item.label))).toEqual([
        ["Engineering"],
        ["Grace Hopper"],
        ["Happy", "Build agent", "Review agent"],
    ]);
    expect(model.sections[1]!.items[0]).toMatchObject({ unread: true, badge: undefined });
    expect(model.sections[2]!.items[0]).toMatchObject({
        label: "Happy",
        depth: undefined,
        unread: true,
        badge: 1,
    });
    expect(model.sections[2]!.items[1]).toMatchObject({
        label: "Build agent",
        depth: 1,
        unread: true,
        badge: 2,
    });
    expect(model.sections[2]!.items[2]).toMatchObject({ label: "Review agent", depth: 1 });
    activeId = "agent-chat";
    model = createModel();
    expect(model.sections[2]!.items[1]).toMatchObject({ unread: false, badge: undefined });
    const changedAgent = projection(
        { ...agentChat.chat, unreadCount: 8, mentionCount: 3 },
        "Release agent",
        agent,
    );
    activeId = "";
    sidebar = {
        status: { type: "ready" },
        chats: [changedAgent, secondAgentChat, defaultAgentChat, humanChat, channel],
    };
    model = createModel();
    expect(model.sections[2]!.items[1]).toMatchObject({
        label: "Release agent",
        unread: true,
        badge: 3,
    });
    expect(model.sections[2]!.items.map((item) => item.label)).toEqual([
        "Happy",
        "Release agent",
        "Review agent",
    ]);
    expect(model.sections[2]!.items.map((item) => item.depth)).toEqual([undefined, 1, 1]);
});

it("keeps agent conversations top-level when search omits the main chat", () => {
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "build",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            chats: [
                projection(
                    chat("happy-chat", "dm", { isDefaultAgentConversation: true }),
                    "Happy",
                    happy,
                ),
                projection(chat("agent-chat", "dm"), "Build agent", agent),
            ],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        }),
        avatarFor: () => undefined,
    });

    expect(model.sections.find((section) => section.id === "agents")!.items).toMatchObject([
        { id: "agent-chat", depth: undefined },
    ]);
});

it("nests child channels under their parent, flags archives, and rescues orphaned children", () => {
    const parent = projection(chat("parent", "private_channel", { name: "Parent" }), "Parent");
    const childActive = projection(
        chat("child-a", "private_channel", { name: "Child A", parentChatId: "parent" }),
        "Child A",
    );
    const childArchived = projection(
        chat("child-b", "private_channel", {
            name: "Child B",
            parentChatId: "parent",
            archivedAt: "2026-07-01T00:00:00.000Z",
        }),
        "Child B",
    );
    // Its parent is absent from the projection set (e.g. filtered by search),
    // so it must stay reachable as a top-level row rather than disappearing.
    const orphan = projection(
        chat("orphan", "private_channel", { name: "Orphan", parentChatId: "missing" }),
        "Orphan",
    );
    const archivedParent = projection(
        chat("solo", "private_channel", {
            name: "Solo",
            archivedAt: "2026-07-02T00:00:00.000Z",
        }),
        "Solo",
    );
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            chats: [parent, childActive, childArchived, orphan, archivedParent],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        }),
        avatarFor: () => undefined,
    });
    const channels = model.sections.find((section) => section.id === "channels")!.items;
    expect(channels.map((item) => item.id)).toEqual([
        "parent",
        "child-a",
        "child-b",
        "orphan",
        "solo",
    ]);
    expect(channels.map((item) => item.depth)).toEqual([undefined, 1, 1, undefined, undefined]);
    expect(channels.map((item) => item.archived)).toEqual([
        undefined,
        undefined,
        true,
        undefined,
        true,
    ]);
});

it("keeps the default-agent conversation in Agents when member projection is unavailable", () => {
    const fallback = projection(
        chat("happy-chat", "dm", { isDefaultAgentConversation: true }),
        "Direct message",
    );
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "",
        sidebarSnapshot: () => ({ status: { type: "ready" }, chats: [fallback] }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        }),
        avatarFor: () => undefined,
    });

    expect(model.sections.find((section) => section.id === "dms")!.items).toEqual([]);
    expect(model.sections.find((section) => section.id === "agents")!.items).toEqual([
        expect.objectContaining({ id: "happy-chat", kind: "agent" }),
    ]);
});
