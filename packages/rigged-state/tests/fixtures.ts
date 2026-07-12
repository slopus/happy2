import type { ChatSummary, MessageSummary } from "../src/index";

export function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
    return {
        id: "chat-1",
        kind: "private_channel",
        name: "State laboratory",
        slug: "state-laboratory",
        isListed: false,
        retentionMode: "inherit",
        defaultExpiryMode: "none",
        defaultAfterReadScope: "any_reader",
        lifecycleVersion: "1",
        createdByUserId: "user-1",
        pts: "0",
        lastMessageSequence: "0",
        membershipEpoch: "1",
        membershipRole: "owner",
        starred: false,
        lastReadSequence: "0",
        unreadCount: 0,
        mentionCount: 0,
        notificationLevel: "all",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

export function message(overrides: Partial<MessageSummary> = {}): MessageSummary {
    return {
        id: "message-1",
        chatId: "chat-1",
        sequence: "1",
        changePts: "1",
        kind: "user",
        text: "hello",
        threadReplyCount: 0,
        revision: 1,
        mentions: [],
        attachments: [],
        reactions: [],
        receipts: [],
        expiryMode: "none",
        createdAt: "2026-01-01T00:00:01.000Z",
        ...overrides,
    };
}
