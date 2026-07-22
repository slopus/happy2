import type { ChatSummary, DirectoryUserProjection } from "happy2-state";
import { expect, it } from "vitest";
import { chatChannelAccessProject } from "./chatChannelAccessModel";

function chat(values: Partial<ChatSummary>): ChatSummary {
    return {
        id: "channel",
        kind: "public_channel",
        isListed: true,
        isMain: false,
        autoJoin: false,
        isDefaultAgentConversation: false,
        retentionMode: "inherit",
        defaultExpiryMode: "none",
        defaultAfterReadScope: "all_readers",
        lifecycleVersion: "1",
        createdByUserId: "creator",
        pts: "0",
        lastMessageSequence: "0",
        membershipEpoch: "1",
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

const people: DirectoryUserProjection[] = [
    {
        id: "creator",
        displayName: "Maya Johnson",
        username: "maya",
        kind: "human",
        role: "admin",
        presence: "online",
    },
    {
        id: "owner",
        displayName: "Nora Kim",
        username: "nora",
        kind: "human",
        role: "member",
        presence: "offline",
    },
];

it("credits a public channel's directory-resolved creator and never projects an owner", () => {
    expect(chatChannelAccessProject({ chat: chat({}), directoryUsers: people })).toEqual({
        directoryListed: true,
        visibility: "public",
        steward: { name: "Maya Johnson" },
    });
});

it("credits a private channel's directory-resolved owner and keeps child parent context", () => {
    const parent = chat({
        id: "founders",
        kind: "private_channel",
        name: "Founders",
        ownerUserId: "owner",
    });
    const child = chat({
        id: "hiring",
        kind: "private_channel",
        name: "Hiring plan",
        ownerUserId: "owner",
        parentChatId: parent.id,
    });
    expect(chatChannelAccessProject({ chat: child, directoryUsers: people, parent })).toEqual({
        directoryListed: true,
        visibility: "private",
        steward: { name: "Nora Kim" },
        inheritedFrom: "Founders",
    });
});

it("carries an unlisted public channel's authoritative directory state", () => {
    expect(
        chatChannelAccessProject({ chat: chat({ isListed: false }), directoryUsers: people }),
    ).toMatchObject({ directoryListed: false, visibility: "public" });
});
