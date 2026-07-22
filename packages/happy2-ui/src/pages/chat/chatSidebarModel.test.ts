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
const project = {
    id: "project-1",
    name: "Product",
    isDefault: true,
    syncSequence: "1",
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
};
function chat(
    id: string,
    kind: ChatSummary["kind"],
    values: Partial<ChatSummary> = {},
): ChatSummary {
    return {
        id,
        kind,
        ...(kind === "dm" ? {} : { projectId: project.id }),
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
        projects: [project],
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
    expect(model.sections.map((section) => section.id)).toEqual([
        "projects",
        "project:project-1",
        "browse",
        "dms",
        "agents",
    ]);
    expect(model.sections.map((section) => section.label)).toEqual([
        "Projects",
        "Product",
        "Discover channels",
        "Humans",
        "Agents",
    ]);
    expect(model.sections.map((section) => section.items.map((item) => item.label))).toEqual([
        [],
        ["Engineering"],
        [],
        ["Grace Hopper"],
        ["Happy", "Build agent", "Review agent"],
    ]);
    const projectSection = () =>
        model.sections.find((section) => section.id === "project:project-1")!;
    const humanSection = () => model.sections.find((section) => section.id === "dms")!;
    const agentSection = () => model.sections.find((section) => section.id === "agents")!;
    expect(projectSection().items[0]).toMatchObject({ label: "Engineering", icon: undefined });
    expect(humanSection().items[0]).toMatchObject({ unread: true, badge: undefined });
    expect(agentSection().items[0]).toMatchObject({
        label: "Happy",
        depth: undefined,
        unread: true,
        badge: 1,
    });
    expect(agentSection().items[1]).toMatchObject({
        label: "Build agent",
        depth: 1,
        unread: true,
        badge: 2,
    });
    expect(agentSection().items[2]).toMatchObject({ label: "Review agent", depth: 1 });
    activeId = "agent-chat";
    model = createModel();
    expect(agentSection().items[1]).toMatchObject({ unread: false, badge: undefined });
    const changedAgent = projection(
        { ...agentChat.chat, unreadCount: 8, mentionCount: 3 },
        "Release agent",
        agent,
    );
    activeId = "";
    sidebar = {
        status: { type: "ready" },
        projects: [project],
        chats: [changedAgent, secondAgentChat, defaultAgentChat, humanChat, channel],
    };
    model = createModel();
    expect(agentSection().items[1]).toMatchObject({
        label: "Release agent",
        unread: true,
        badge: 3,
    });
    expect(agentSection().items.map((item) => item.label)).toEqual([
        "Happy",
        "Release agent",
        "Review agent",
    ]);
    expect(agentSection().items.map((item) => item.depth)).toEqual([undefined, 1, 1]);
});

it("groups public and private channels in their project and marks private rows with a lock", () => {
    const shared = projection(
        chat("shared-channel", "public_channel", { name: "Engineering" }),
        "Engineering",
    );
    const sharedChild = projection(
        chat("shared-child", "public_channel", {
            name: "Frontend",
            parentChatId: "shared-channel",
        }),
        "Frontend",
    );
    const privateChannel = projection(
        chat("private-channel", "private_channel", { name: "Founders" }),
        "Founders",
    );
    const privateChild = projection(
        chat("private-child", "private_channel", {
            name: "Hiring",
            parentChatId: "private-channel",
        }),
        "Hiring",
    );
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            projects: [project],
            chats: [shared, sharedChild, privateChannel, privateChild],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        }),
        avatarFor: () => undefined,
    });
    const section = (id: string) => model.sections.find((candidate) => candidate.id === id)!;
    expect(
        section("project:project-1").items.map((item) => [item.id, item.depth, item.icon]),
    ).toEqual([
        ["shared-channel", undefined, undefined],
        ["shared-child", 1, undefined],
        ["private-channel", undefined, "lock"],
        ["private-child", 1, "lock"],
    ]);
    for (const row of section("project:project-1").items) expect(row.kind).toBe("channel");
});

it("keeps channels isolated under their owning project while DMs remain separate", () => {
    const secondProject = { ...project, id: "project-2", name: "Research", isDefault: false };
    const productChannel = projection(
        chat("product", "public_channel", { name: "Product" }),
        "Product",
    );
    const researchChannel = projection(
        chat("research", "private_channel", { name: "Research", projectId: secondProject.id }),
        "Research",
    );
    const direct = projection(chat("direct", "dm"), "Grace Hopper", human);
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            projects: [project, secondProject],
            chats: [productChannel, researchChannel, direct],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        }),
        avatarFor: () => undefined,
    });
    expect(
        model.sections.find((section) => section.id === "project:project-1")!.items,
    ).toMatchObject([{ id: "product" }]);
    expect(
        model.sections.find((section) => section.id === "project:project-2")!.items,
    ).toMatchObject([{ id: "research", icon: "lock" }]);
    expect(model.sections.find((section) => section.id === "dms")!.items).toMatchObject([
        { id: "direct" },
    ]);
});

it("groups discoverable channels under their project in the channel directory", () => {
    const secondProject = { ...project, id: "project-2", name: "Research", isDefault: false };
    const joined = chat("joined", "public_channel", { name: "Joined" });
    const { membershipRole: _productRole, ...productChannel } = chat("product", "public_channel", {
        name: "Roadmap",
    });
    const { membershipRole: _researchRole, ...researchChannel } = chat(
        "research",
        "public_channel",
        {
            name: "Experiments",
            projectId: secondProject.id,
        },
    );
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            projects: [project, secondProject],
            chats: [projection(joined, "Joined")],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [{ ...joined, membershipRole: "member" }, productChannel, researchChannel],
        }),
        avatarFor: () => undefined,
    });

    expect(model.directoryChannels()).toEqual([
        { id: "product", name: "Roadmap", projectName: "Product", visibility: "public" },
        {
            id: "research",
            name: "Experiments",
            projectName: "Research",
            visibility: "public",
        },
    ]);
});

it("keeps agent conversations top-level when search omits the main chat", () => {
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "build",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            projects: [project],
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
            projects: [project],
            chats: [parent, childActive, childArchived, orphan, archivedParent],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [],
        }),
        avatarFor: () => undefined,
    });
    const channels = model.sections.find((section) => section.id === "project:project-1")!.items;
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
    // Every private channel row—parent, nested child, orphan, or archived—locks.
    expect(channels.map((item) => item.icon)).toEqual(["lock", "lock", "lock", "lock", "lock"]);
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
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            projects: [project],
            chats: [fallback],
        }),
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

it("projects every eligible unjoined channel into the directory with inherited parent context", () => {
    const publicParent = chat("engineering", "public_channel", {
        name: "Engineering",
        membershipRole: undefined,
    });
    const publicChild = chat("release", "public_channel", {
        name: "Release checklist",
        parentChatId: publicParent.id,
        membershipRole: undefined,
    });
    const privateParent = chat("founders", "private_channel", {
        name: "Founders",
        membershipRole: undefined,
    });
    const privateChild = chat("hiring", "private_channel", {
        name: "Hiring plan",
        parentChatId: privateParent.id,
        membershipRole: undefined,
    });
    // A voluntarily-left channel stays eligible and therefore remains joinable.
    const rejoin = chat("alumni", "public_channel", {
        name: "Alumni",
        membershipRole: undefined,
    });
    const joined = chat("already-joined", "public_channel", { name: "Already joined" });
    const archived = chat("archived", "public_channel", {
        archivedAt: "2026-07-03T00:00:00.000Z",
        membershipRole: undefined,
        name: "Archived",
    });
    const model = chatSidebarModelCreate({
        user: () => ({ id: "human-1", firstName: "Ada" }),
        activeConversationId: () => "",
        search: () => "",
        sidebarSnapshot: () => ({
            status: { type: "ready" },
            projects: [project],
            chats: [projection(publicParent, "Engineering")],
        }),
        directorySnapshot: () => ({
            status: { type: "ready", value: true },
            users: [],
            channels: [
                publicParent,
                publicChild,
                privateParent,
                privateChild,
                rejoin,
                joined,
                archived,
            ],
        }),
        avatarFor: () => undefined,
    });
    expect(model.directoryChannels()).toEqual([
        {
            id: "engineering",
            name: "Engineering",
            projectName: "Product",
            visibility: "public",
        },
        {
            id: "release",
            name: "Release checklist",
            projectName: "Product",
            visibility: "public",
            parentName: "Engineering",
        },
        {
            id: "founders",
            name: "Founders",
            projectName: "Product",
            visibility: "private",
        },
        {
            id: "hiring",
            name: "Hiring plan",
            projectName: "Product",
            visibility: "private",
            parentName: "Founders",
        },
        {
            id: "alumni",
            name: "Alumni",
            projectName: "Product",
            visibility: "public",
        },
    ]);
});
