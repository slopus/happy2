export type ChatKind = "dm" | "public_channel" | "private_channel";
export type ChatRole = "owner" | "admin" | "member";
export type DirectMessageType = "direct" | "group";
export type NotificationLevel = "all" | "mentions" | "none";
export type ExpiryMode = "none" | "after_send" | "after_read";

export interface SyncState {
    readonly protocolVersion: 1;
    readonly generation: string;
    readonly sequence: string;
}

export interface ChatSummary {
    readonly id: string;
    readonly kind: ChatKind;
    readonly name?: string;
    readonly slug?: string;
    readonly topic?: string;
    readonly dmType?: DirectMessageType;
    readonly ownerUserId?: string;
    readonly photoFileId?: string;
    readonly isListed: boolean;
    readonly isMain: boolean;
    readonly autoJoin: boolean;
    readonly defaultAgentUserId?: string;
    readonly isPinnedHappy: boolean;
    readonly archivedAt?: string;
    readonly retentionMode: "inherit" | "forever" | "duration";
    readonly retentionSeconds?: number;
    readonly defaultExpiryMode: ExpiryMode;
    readonly defaultSelfDestructSeconds?: number;
    readonly defaultAfterReadScope: "any_reader" | "all_readers";
    readonly lifecycleVersion: string;
    readonly createdByUserId: string;
    readonly pts: string;
    readonly lastMessageSequence: string;
    readonly membershipEpoch: string;
    readonly membershipRole?: ChatRole;
    readonly starred: boolean;
    readonly starOrder?: number;
    readonly lastReadSequence: string;
    readonly unreadCount: number;
    readonly mentionCount: number;
    readonly notificationLevel: NotificationLevel;
    readonly mutedUntil?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface UserSummary {
    readonly id: string;
    readonly username: string;
    readonly firstName: string;
    readonly lastName?: string;
    readonly title?: string;
    readonly photoFileId?: string;
    readonly role: "member" | "admin";
    readonly kind: "human" | "agent";
    readonly agentEffort?: string;
    readonly systemRole?: "service";
    readonly agentRole?: "default";
    readonly createdByUserId?: string;
}

export interface FileSummary {
    readonly id: string;
    readonly kind: "file" | "photo" | "video" | "gif";
    readonly originalName?: string;
    readonly contentType: string;
    readonly size: number;
    readonly width?: number;
    readonly height?: number;
    readonly durationMs?: number;
    readonly thumbhash?: string;
    readonly uploadedByUserId: string;
    readonly createdAt: string;
}

export interface ReactionSummary {
    readonly key: string;
    readonly emoji?: string;
    readonly customEmojiId?: string;
    readonly count: number;
    readonly reacted: boolean;
    readonly userIds: readonly string[];
}

export interface MessageSummary {
    readonly id: string;
    readonly chatId: string;
    readonly sequence: string;
    readonly changePts: string;
    readonly sender?: UserSummary;
    readonly senderBot?: {
        readonly id: string;
        readonly name: string;
        readonly username: string;
        readonly photoFileId?: string;
    };
    readonly kind: "user" | "automated";
    readonly text: string;
    readonly service?: {
        readonly type: "user_added" | "user_joined";
        readonly userId: string;
    };
    readonly generationStatus?: "streaming" | "complete" | "failed";
    readonly quotedMessage?: {
        readonly id: string;
        readonly senderUserId?: string;
        readonly text: string;
        readonly deleted: boolean;
    };
    readonly threadRootMessageId?: string;
    readonly threadReplyCount: number;
    readonly revision: number;
    readonly mentions: readonly {
        readonly kind: "user" | "channel" | "here" | "everyone";
        readonly userId?: string;
        readonly offset: number;
        readonly length: number;
        readonly rawText: string;
    }[];
    readonly forwardedFrom?: { readonly messageId: string; readonly chatId: string };
    readonly attachments: readonly FileSummary[];
    readonly reactions: readonly ReactionSummary[];
    readonly receipts: readonly {
        readonly userId: string;
        readonly deliveredAt?: string;
        readonly readAt?: string;
    }[];
    readonly expiresAt?: string;
    readonly expiryMode: ExpiryMode;
    readonly selfDestructSeconds?: number;
    readonly firstReadAt?: string;
    readonly editedAt?: string;
    readonly deletedAt?: string;
    readonly createdAt: string;
}

export interface PresenceSnapshot {
    readonly userId: string;
    readonly status: "online" | "offline";
    readonly connectionCount: number;
    readonly lastSeenAt?: number;
    readonly expiresAt?: number;
}

export interface PresenceSettingsSummary {
    readonly userId: string;
    readonly availability: "automatic" | "online" | "away" | "dnd";
    readonly customStatusText?: string;
    readonly customStatusEmoji?: string;
    readonly statusExpiresAt?: string;
    readonly dndUntil?: string;
    readonly updatedAt: string;
}

export interface ThreadSummary {
    readonly root: MessageSummary;
    readonly replyCount: number;
    readonly participantCount: number;
    readonly lastReplyMessageId?: string;
    readonly lastReplySequence?: string;
    readonly subscribed: boolean;
    readonly unreadCount: number;
    readonly mentionCount: number;
    readonly updatedAt: string;
}

export interface NotificationSummary {
    readonly id: string;
    readonly kind:
        | "mention"
        | "thread_reply"
        | "direct_message"
        | "reaction"
        | "call"
        | "system"
        | "moderation"
        | "automation";
    readonly chatId?: string;
    readonly messageId?: string;
    readonly threadRootMessageId?: string;
    readonly actorUserId?: string;
    readonly readAt?: string;
    readonly createdAt: string;
}

export interface CallSummary {
    readonly id: string;
    readonly chatId: string;
    readonly createdByUserId?: string;
    readonly kind: "audio" | "video";
    readonly status: "ringing" | "active" | "ended" | "cancelled" | "failed";
    readonly participants: readonly {
        readonly userId: string;
        readonly status:
            | "invited"
            | "ringing"
            | "joined"
            | "declined"
            | "left"
            | "missed"
            | "removed";
        readonly joinedAt?: string;
        readonly leftAt?: string;
    }[];
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly endReason?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export type WebRtcSignal =
    | {
          readonly kind: "offer" | "answer";
          readonly sdp: string;
      }
    | {
          readonly kind: "ice-candidate";
          readonly candidate: string;
          readonly sdpMid?: string | null;
          readonly sdpMLineIndex?: number | null;
          readonly usernameFragment?: string | null;
      }
    | {
          readonly kind: "hangup";
          readonly reason?: "ended" | "declined" | "busy" | "failed";
      };

export interface ChatPinSummary {
    readonly id: string;
    readonly chatId: string;
    readonly message: MessageSummary;
    readonly pinnedByUserId?: string;
    readonly createdAt: string;
}

export interface ChatBookmarkSummary {
    readonly id: string;
    readonly chatId: string;
    readonly title: string;
    readonly kind: "link" | "message" | "file";
    readonly url?: string;
    readonly messageId?: string;
    readonly fileId?: string;
    readonly emoji?: string;
    readonly createdByUserId?: string;
    readonly sortOrder: number;
    readonly createdAt: string;
}

export type WorkspaceGitStatus =
    | "added"
    | "deleted"
    | "ignored"
    | "modified"
    | "renamed"
    | "untracked";

export interface WorkspaceGitStatusEntry {
    readonly path: string;
    readonly status: WorkspaceGitStatus;
}

export interface WorkspaceDirectoryLoad {
    readonly directory: string;
    readonly loadedPathCount: number;
    readonly pageCount: number;
    readonly complete: boolean;
}

export interface WorkspaceTextFile {
    readonly path: string;
    readonly content: string;
    readonly size: number;
    /** Opaque equality token supplied with conflict-safe writes and deletes. */
    readonly version: string;
}

export interface WorkspaceTextEdit {
    /** UTF-16 string offset, matching JavaScript editor coordinates. */
    readonly start: number;
    /** Exclusive UTF-16 string offset. */
    readonly end: number;
    readonly text: string;
}

export interface WorkspaceTextPatch {
    readonly edits: readonly WorkspaceTextEdit[];
}

export type WorkspaceFileWriteInput =
    | {
          readonly path: string;
          readonly expectedVersion: string | null;
          readonly content: string;
          readonly patch?: never;
      }
    | {
          readonly path: string;
          readonly expectedVersion: string | null;
          readonly patch: WorkspaceTextPatch;
          readonly content?: never;
      };

/** The currently materialized, memory-only portion of one chat workspace. */
export interface ClientWorkspace {
    readonly chatId: string;
    readonly requestedDirectories: readonly string[];
    readonly paths: readonly string[];
    readonly gitStatus: readonly WorkspaceGitStatusEntry[];
    readonly revision: string;
    readonly unloadedDirectories: readonly string[];
    readonly gitStatusPending: boolean;
    readonly directories: readonly WorkspaceDirectoryLoad[];
}

export type RealtimeEvent =
    | {
          readonly type: "sync";
          readonly sequence: string;
          readonly chats: readonly { readonly chatId: string; readonly pts: string }[];
          readonly areas: readonly string[];
      }
    | {
          readonly type: "typing";
          readonly chatId: string;
          readonly userId: string;
          readonly active: boolean;
          readonly occurredAt: number;
          readonly expiresAt?: number;
      }
    | {
          readonly type: "agent.activity";
          readonly chatId: string;
          readonly agentUserId: string;
          readonly turnId: string;
          readonly active: boolean;
          readonly phase: AgentActivityPhase;
          readonly tokenCount: number;
          readonly startedAt: number;
          readonly occurredAt: number;
          readonly expiresAt?: number;
      }
    | {
          readonly type: "presence";
          readonly change: "activity" | "expired" | "disconnected";
          readonly snapshot: PresenceSnapshot;
          readonly occurredAt: number;
      }
    | {
          readonly type: "call.signal";
          readonly callId: string;
          readonly chatId: string;
          readonly senderUserId: string;
          readonly recipientUserId?: string;
          readonly signal: WebRtcSignal;
          readonly occurredAt: number;
      }
    | {
          readonly type: "workspace.changed";
          readonly chatId: string;
          readonly occurredAt: number;
      };

export interface SendMessageInput {
    readonly text?: string;
    readonly attachmentFileIds?: readonly string[];
    readonly quotedMessageId?: string;
    readonly threadRootMessageId?: string;
    readonly expiryMode?: ExpiryMode;
    readonly selfDestructSeconds?: number;
    readonly afterReadScope?: "any_reader" | "all_readers";
    readonly clientMutationId?: string;
}

export interface CreateChannelInput {
    readonly kind: "public_channel" | "private_channel";
    readonly name: string;
    readonly slug: string;
    readonly topic?: string;
    readonly autoJoin?: boolean;
}

export interface CreateAgentInput {
    readonly name: string;
    readonly username: string;
}

export interface TypingState {
    readonly chatId: string;
    readonly userId: string;
    readonly expiresAt: number;
}

/** Which kind of work an agent is doing during the current turn. */
export type AgentActivityPhase = "thinking" | "typing";

/**
 * Live, per-agent progress for the turn an agent is currently working on in a
 * chat. Reconstructed from ephemeral `agent.activity` hints and expired locally;
 * never treated as durable sync state.
 */
export interface AgentActivityState {
    readonly chatId: string;
    readonly agentUserId: string;
    readonly turnId: string;
    readonly phase: AgentActivityPhase;
    readonly tokenCount: number;
    readonly startedAt: number;
    readonly expiresAt: number;
}

export class UserError extends Error {
    constructor(
        message: string,
        readonly code?: string,
        readonly cause?: unknown,
    ) {
        super(message, { cause });
        this.name = "UserError";
    }
}

export class WorkspaceFileConflictError extends UserError {
    constructor(
        readonly path: string,
        readonly currentFile?: WorkspaceTextFile,
        readonly attemptedContent?: string,
        cause?: unknown,
    ) {
        super(
            "Workspace file changed and the edit could not be reapplied safely.",
            "workspace_file_conflict",
            cause,
        );
        this.name = "WorkspaceFileConflictError";
    }
}
