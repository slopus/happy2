import type { ChatSummary, SidebarChatProjection } from "happy2-state";
import { expect, it, vi } from "vitest";
import { chatChannelModelCreate } from "./chatChannelModel";
import type { ChatPageActions } from "./ChatPage.js";
function chat(values: Partial<ChatSummary> = {}): ChatSummary {
    return {
        id: "chat-1",
        kind: "private_channel",
        isListed: false,
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
        membershipRole: "owner",
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
function projectionOf(summary: ChatSummary): SidebarChatProjection {
    return {
        id: summary.id,
        chat: summary,
        displayName: summary.name ?? summary.id,
        participants: [],
    };
}
function build(options: {
    active: ChatSummary;
    siblings?: ChatSummary[];
    canEdit?: boolean;
    onChildCreate?: (parentChatId: string) => void;
    actions?: Partial<ChatPageActions>;
}) {
    const chats = [options.active, ...(options.siblings ?? [])].map(projectionOf);
    return chatChannelModelCreate({
        activeChatId: () => options.active.id,
        activeChat: () => options.active,
        sidebarChats: () => chats,
        canEdit: () => options.canEdit ?? true,
        actions: {
            channelArchive: vi.fn(async () => undefined),
            channelUnarchive: vi.fn(async () => undefined),
            ...options.actions,
        } as unknown as ChatPageActions,
        onInfoOpen: () => undefined,
        onLeave: () => undefined,
        onChildCreate: options.onChildCreate ?? (() => undefined),
        onError: () => undefined,
    });
}
const labels = (model: ReturnType<typeof build>) =>
    model.menuItems().flatMap((item) => (item.kind === "item" ? [item.label] : []));

it("offers child creation and archive on a manageable top-level channel", () => {
    const model = build({ active: chat({ id: "parent", name: "Parent" }) });
    expect(labels(model)).toEqual([
        "Edit settings",
        "Create subchannel",
        "Archive channel",
        "Leave channel",
    ]);
});

it("routes child creation to the active channel id", () => {
    const onChildCreate = vi.fn();
    const model = build({ active: chat({ id: "parent" }), onChildCreate });
    model.menuSelect("child");
    expect(onChildCreate).toHaveBeenCalledWith("parent");
});

it("hides child creation and offers unarchive for an independently archived channel", () => {
    const archive = vi.fn(async () => undefined);
    const unarchive = vi.fn(async () => undefined);
    const model = build({
        active: chat({ id: "parent", archivedAt: "2026-07-01T00:00:00.000Z" }),
        actions: { channelArchive: archive, channelUnarchive: unarchive },
    });
    expect(labels(model)).toEqual(["Edit settings", "Unarchive channel", "Leave channel"]);
    model.menuSelect("unarchive");
    expect(unarchive).toHaveBeenCalledWith("parent");
    expect(archive).not.toHaveBeenCalled();
});

it("hides child creation on a child channel and archives it independently", () => {
    const archive = vi.fn(async () => undefined);
    const model = build({
        active: chat({ id: "child", parentChatId: "parent" }),
        siblings: [chat({ id: "parent", name: "Parent" })],
        actions: { channelArchive: archive },
    });
    expect(labels(model)).toEqual(["Edit settings", "Archive channel", "Leave channel"]);
    model.menuSelect("archive");
    expect(archive).toHaveBeenCalledWith("child");
});

it("suppresses the unarchive action when the archive is inherited from an archived parent", () => {
    const model = build({
        active: chat({
            id: "child",
            parentChatId: "parent",
            archivedAt: "2026-07-02T00:00:00.000Z",
        }),
        siblings: [chat({ id: "parent", name: "Parent", archivedAt: "2026-07-02T00:00:00.000Z" })],
    });
    // The child is archived only by inheritance; the server would reject an
    // independent unarchive, so no archive toggle is offered.
    expect(labels(model)).toEqual(["Edit settings", "Leave channel"]);
});

it("omits management actions when the viewer cannot edit", () => {
    const model = build({
        active: chat({ id: "parent", membershipRole: "member" }),
        canEdit: false,
    });
    expect(labels(model)).toEqual(["Leave channel"]);
});

it("keeps Leave available on the main channel while withholding management actions", () => {
    const leave = vi.fn(async () => undefined);
    const model = build({
        active: chat({ id: "main", isMain: true, membershipRole: "admin" }),
        actions: { chatLeave: leave },
    });
    expect(labels(model)).toEqual(["Leave channel"]);
    model.menuSelect("leave");
    expect(leave).toHaveBeenCalledWith("main");
});

it("keeps Leave available on a child channel for a non-managing member", () => {
    const leave = vi.fn(async () => undefined);
    const model = build({
        active: chat({ id: "child", parentChatId: "parent", membershipRole: "member" }),
        canEdit: false,
        actions: { chatLeave: leave },
    });
    expect(labels(model)).toEqual(["Leave channel"]);
    model.menuSelect("leave");
    expect(leave).toHaveBeenCalledWith("child");
});
