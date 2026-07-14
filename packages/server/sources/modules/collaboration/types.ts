import type { FileKind } from "../database.js";

export type ChatKind = "dm" | "public_channel" | "private_channel";
export type ChatRole = "owner" | "admin" | "member";
export type DirectMessageType = "direct" | "group";
export type NotificationLevel = "all" | "mentions" | "none";
export type ExpiryMode = "none" | "after_send" | "after_read";

export interface SyncState {
    protocolVersion: 1;
    generation: string;
    sequence: string;
}

export interface ChatSummary {
    id: string;
    kind: ChatKind;
    name?: string;
    slug?: string;
    topic?: string;
    dmType?: DirectMessageType;
    ownerUserId?: string;
    photoFileId?: string;
    isListed: boolean;
    archivedAt?: string;
    retentionMode: "inherit" | "forever" | "duration";
    retentionSeconds?: number;
    defaultExpiryMode: ExpiryMode;
    defaultSelfDestructSeconds?: number;
    defaultAfterReadScope: "any_reader" | "all_readers";
    lifecycleVersion: string;
    createdByUserId: string;
    pts: string;
    lastMessageSequence: string;
    membershipEpoch: string;
    membershipRole?: ChatRole;
    starred: boolean;
    starOrder?: number;
    lastReadSequence: string;
    unreadCount: number;
    mentionCount: number;
    notificationLevel: NotificationLevel;
    mutedUntil?: string;
    createdAt: string;
    updatedAt: string;
}

export interface UserSummary {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    title?: string;
    photoFileId?: string;
    role: "member" | "admin";
    kind: "human" | "agent";
    createdByUserId?: string;
}

export interface AdminUserSummary extends UserSummary {
    lastAccessAt?: string;
}

export interface FileSummary {
    id: string;
    kind: FileKind;
    originalName?: string;
    contentType: string;
    size: number;
    width?: number;
    height?: number;
    durationMs?: number;
    thumbhash?: string;
    uploadedByUserId: string;
    createdAt: string;
}

export interface ReactionSummary {
    key: string;
    emoji?: string;
    customEmojiId?: string;
    count: number;
    reacted: boolean;
    userIds: string[];
}

export interface MessageSummary {
    id: string;
    chatId: string;
    sequence: string;
    changePts: string;
    sender?: UserSummary;
    senderBot?: { id: string; name: string; username: string; photoFileId?: string };
    kind: "user" | "automated";
    text: string;
    quotedMessage?: {
        id: string;
        senderUserId?: string;
        text: string;
        deleted: boolean;
    };
    threadRootMessageId?: string;
    threadReplyCount: number;
    revision: number;
    mentions: Array<{
        kind: "user" | "channel" | "here" | "everyone";
        userId?: string;
        offset: number;
        length: number;
        rawText: string;
    }>;
    forwardedFrom?: { messageId: string; chatId: string };
    attachments: FileSummary[];
    reactions: ReactionSummary[];
    receipts: Array<{
        userId: string;
        deliveredAt?: string;
        readAt?: string;
    }>;
    expiresAt?: string;
    expiryMode: ExpiryMode;
    selfDestructSeconds?: number;
    firstReadAt?: string;
    editedAt?: string;
    deletedAt?: string;
    createdAt: string;
}

export interface ThreadSummary {
    root: MessageSummary;
    replyCount: number;
    participantCount: number;
    lastReplyMessageId?: string;
    lastReplySequence?: string;
    subscribed: boolean;
    unreadCount: number;
    mentionCount: number;
    updatedAt: string;
}

export interface NotificationSummary {
    id: string;
    kind:
        | "mention"
        | "thread_reply"
        | "direct_message"
        | "reaction"
        | "call"
        | "system"
        | "moderation"
        | "automation";
    chatId?: string;
    messageId?: string;
    threadRootMessageId?: string;
    actorUserId?: string;
    readAt?: string;
    createdAt: string;
}

export interface PresenceSettingsSummary {
    userId: string;
    availability: "automatic" | "online" | "away" | "dnd";
    customStatusText?: string;
    customStatusEmoji?: string;
    statusExpiresAt?: string;
    dndUntil?: string;
    updatedAt: string;
}

export interface CallSummary {
    id: string;
    chatId: string;
    createdByUserId?: string;
    kind: "audio" | "video";
    status: "ringing" | "active" | "ended" | "cancelled" | "failed";
    participants: Array<{
        userId: string;
        status: "invited" | "ringing" | "joined" | "declined" | "left" | "missed" | "removed";
        joinedAt?: string;
        leftAt?: string;
    }>;
    startedAt?: string;
    endedAt?: string;
    endReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ChatPinSummary {
    id: string;
    chatId: string;
    message: MessageSummary;
    pinnedByUserId?: string;
    createdAt: string;
}

export interface ChatBookmarkSummary {
    id: string;
    chatId: string;
    title: string;
    kind: "link" | "message" | "file";
    url?: string;
    messageId?: string;
    fileId?: string;
    emoji?: string;
    createdByUserId?: string;
    sortOrder: number;
    createdAt: string;
}

export interface MutationHint {
    sequence: string;
    chats: Array<{ chatId: string; pts: string }>;
    areas: string[];
}

export class CollaborationError extends Error {
    constructor(
        readonly code:
            | "not_found"
            | "forbidden"
            | "invalid"
            | "conflict"
            | "future_state"
            | "generation_mismatch",
        message: string,
    ) {
        super(message);
    }
}
