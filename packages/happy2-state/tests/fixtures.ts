import type {
    AgentTurnTraceDetails,
    AgentTurnTraceSummary,
    ChatSummary,
    MessageSummary,
} from "../src/index";

export function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
    return {
        id: "chat-1",
        kind: "private_channel",
        name: "State laboratory",
        slug: "state-laboratory",
        isListed: false,
        isMain: false,
        autoJoin: false,
        isDefaultAgentConversation: false,
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

export function agentTraceSummary(
    overrides: Partial<AgentTurnTraceSummary> = {},
): AgentTurnTraceSummary {
    return {
        turnId: "turn-1",
        agentUserId: "agent-1",
        status: "running",
        startedAt: "2026-01-01T00:00:01.000Z",
        latest: { kind: "status", title: "Turn started", occurredAt: 1 },
        entryCount: 1,
        subagents: [],
        backgroundTerminals: [],
        ...overrides,
    };
}

export function agentTraceDetails(
    overrides: Partial<AgentTurnTraceDetails> = {},
): AgentTurnTraceDetails {
    return {
        ...agentTraceSummary(),
        entries: [
            {
                id: "entry-1",
                kind: "status",
                title: "Turn started",
                status: "complete",
                occurredAt: 1,
            },
        ],
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
        automated: false,
        audience: "people",
        agentUserIds: [],
        text: "hello",
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
