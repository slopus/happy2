import type { FileKind } from "../database.js";

export type ChatKind = "dm" | "public_channel" | "private_channel";
export type ChatRole = "owner" | "admin" | "member";

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
    createdByUserId: string;
    pts: string;
    lastMessageSequence: string;
    membershipEpoch: string;
    membershipRole?: ChatRole;
    starred: boolean;
    starOrder?: number;
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
    forwardedFrom?: { messageId: string; chatId: string };
    attachments: FileSummary[];
    reactions: ReactionSummary[];
    expiresAt?: string;
    editedAt?: string;
    deletedAt?: string;
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
