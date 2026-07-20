export type ChatKind = "dm" | "public_channel" | "private_channel";
export type ChatRole = "owner" | "admin" | "member";
export type DirectMessageType = "direct" | "group";
export type NotificationLevel = "all" | "mentions" | "none";
export type ExpiryMode = "none" | "after_send" | "after_read";
export type MessageAudience = "people" | "agents";

export interface SyncState {
    readonly protocolVersion: 1;
    readonly generation: string;
    readonly sequence: string;
}

export interface ChatSummary {
    readonly id: string;
    readonly kind: ChatKind;
    readonly parentMessageId?: string;
    /**
     * Parent channel of a child channel. Distinct from `parentMessageId` (which
     * marks a message thread): a child channel is a first-class sidebar channel
     * that shares its parent's container/workspace but keeps an independent
     * history and may run a different agent model. Absent for top-level channels.
     */
    readonly parentChatId?: string;
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
    /**
     * Agent model this channel's default agent runs. Child channels may select a
     * model independent of their parent; absent means the server default model.
     */
    readonly agentModelId?: string;
    readonly isDefaultAgentConversation: boolean;
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
    readonly followed: boolean;
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

export type AgentTurnTraceKind =
    | "reasoning"
    | "response"
    | "tool"
    | "subagent"
    | "terminal"
    | "status";

export type AgentTurnTraceEntryStatus = "running" | "complete" | "failed";

export type AgentTurnStatus = "pending" | "running" | "complete" | "failed";

/** The live public projection of one Rig subagent belonging to a turn. */
export interface AgentTurnSubagentSummary {
    readonly id: string;
    readonly depth: number;
    readonly description: string;
    readonly status:
        | "idle"
        | "queued"
        | "running"
        | "completed"
        | "aborted"
        | "suspended"
        | "error";
    readonly latestText?: string;
    readonly startedAt: number;
    readonly totalTokens: number;
}

/** The live public projection of one background terminal belonging to a turn. */
export interface AgentTurnBackgroundTerminalSummary {
    readonly id: string;
    readonly command: string;
    readonly cwd: string;
    readonly startedAt: number;
}

/** One durable, coalesced span in an agent turn's execution history. */
export interface AgentTurnTraceEntrySummary {
    readonly id: string;
    readonly kind: AgentTurnTraceKind;
    readonly title: string;
    readonly detail?: string;
    readonly status: AgentTurnTraceEntryStatus;
    readonly occurredAt: number;
    readonly completedAt?: number;
}

/** The latest meaningful activity of a turn, carried on its assistant message. */
export interface AgentTurnTraceLatest {
    readonly kind: AgentTurnTraceKind;
    readonly title: string;
    readonly detail?: string;
    readonly occurredAt: number;
}

/** The compact trace projection attached to an assistant message. */
export interface AgentTurnTraceSummary {
    readonly turnId: string;
    readonly agentUserId: string;
    readonly status: AgentTurnStatus;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly latest?: AgentTurnTraceLatest;
    readonly entryCount: number;
    readonly subagents: readonly AgentTurnSubagentSummary[];
    readonly backgroundTerminals: readonly AgentTurnBackgroundTerminalSummary[];
}

/** The complete ordered execution history behind one assistant message. */
export interface AgentTurnTraceDetails extends AgentTurnTraceSummary {
    readonly entries: readonly AgentTurnTraceEntrySummary[];
}

export type McpAppStatus = "in_progress" | "completed" | "failed";

/** One interactive MCP App attached to an assistant message, summarized inline. */
export interface McpAppSummary {
    readonly callId: string;
    readonly toolName: string;
    readonly resourceUri: string;
    readonly status: McpAppStatus;
}

/**
 * Standardized MCP Apps resource metadata (`io.modelcontextprotocol/ui`) that the
 * host enforces around the sandboxed app: the connect/resource CSP allowlists,
 * the extra iframe permissions the app requested, the optional trusted origin,
 * and the app's border preference.
 */
export interface McpAppResourceMeta {
    readonly ui: {
        readonly csp?: {
            readonly connectDomains?: readonly string[];
            readonly resourceDomains?: readonly string[];
            readonly frameDomains?: readonly string[];
            readonly baseUriDomains?: readonly string[];
        };
        readonly permissions?: {
            readonly camera?: Readonly<Record<string, never>>;
            readonly microphone?: Readonly<Record<string, never>>;
            readonly geolocation?: Readonly<Record<string, never>>;
            readonly clipboardWrite?: Readonly<Record<string, never>>;
        };
        readonly domain?: string;
        readonly prefersBorder?: boolean;
    };
}

/** The server-snapshotted, validated HTML resource an MCP App renders. */
export interface McpAppResource {
    readonly html: string;
    readonly contentHashSha256: string;
    readonly meta: McpAppResourceMeta;
}

/** The durable tool call an MCP App renders, including its stored result. */
export interface McpAppDetails {
    readonly callId: string;
    readonly toolName: string;
    readonly resourceUri: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly status: McpAppStatus;
    readonly result?: Readonly<Record<string, unknown>>;
}

/** The full on-demand view backing one MCP App surface: its call plus resource. */
export interface McpAppView {
    readonly app: McpAppDetails;
    readonly resource: McpAppResource;
}

/**
 * Raw MCP `tools/call` result proxied back to a sandboxed app. The host forwards
 * it opaquely to the app frame, so only the transport-relevant shape is typed.
 */
export type McpToolResult = Readonly<Record<string, unknown>>;

/** Raw MCP `resources/read` result proxied back to a sandboxed app. */
export type McpResourceReadResult = Readonly<Record<string, unknown>>;

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
    readonly audience: MessageAudience;
    /** Every agent this message addressed (default agent plus explicit additions). */
    readonly agentUserIds: readonly string[];
    readonly text: string;
    readonly service?:
        | {
              readonly type: "user_added" | "user_joined";
              readonly userId: string;
          }
        | {
              readonly type: "agent_effort_changed";
              readonly agentUserId: string;
              readonly effort: string;
          };
    readonly generationStatus?: "streaming" | "complete" | "failed";
    readonly agentTrace?: AgentTurnTraceSummary;
    /** Interactive MCP Apps this assistant message rendered, summarized inline. */
    readonly mcpApps?: readonly McpAppSummary[];
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

export type DocumentFormat = "blocknote";

/** One channel a document is attached to. Detaching leaves the document intact. */
export interface DocumentAttachment {
    readonly chatId: string;
    readonly attachedByUserId: string;
    readonly attachedAt: string;
}

export interface DocumentSummary {
    readonly id: string;
    readonly ownerUserId: string;
    readonly title: string;
    readonly format: DocumentFormat;
    /**
     * Channels this document is attached to. A collaborator only sees the
     * attachments whose channel they are a member of, so this is a viewer
     * projection rather than the document's complete attachment set.
     */
    readonly channelAttachments: readonly DocumentAttachment[];
    /** Sequence of the newest accepted update, as an unsigned decimal string. */
    readonly latestSequence: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

/** A merged base64 Yjs update covering a document up to `sequence`. */
export interface DocumentSnapshotPayload {
    readonly update: string;
    readonly sequence: string;
}

export interface DocumentUpdatePayload {
    readonly sequence: string;
    readonly update: string;
}

export interface DocumentPresenceEntry {
    readonly documentId: string;
    readonly userId: string;
    readonly clientId: string;
    /** Monotonic per client so stale out-of-order deliveries are discarded. */
    readonly revision: number;
    readonly active: boolean;
    /** Opaque editor awareness payload (cursor, selection, identity). */
    readonly state?: unknown;
    /** Present while active so observers can expire a silent participant. */
    readonly expiresAt?: number;
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
          readonly subagents: readonly AgentTurnSubagentSummary[];
          readonly backgroundTerminals: readonly AgentTurnBackgroundTerminalSummary[];
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
      }
    | {
          readonly type: "document.updated";
          /** Present for attached-channel delivery, absent for the unattached owner. */
          readonly chatId?: string;
          readonly documentId: string;
          readonly sequence: string;
          readonly occurredAt: number;
      }
    | {
          readonly type: "document.presence";
          /** Present for attached-channel delivery, absent for the unattached owner. */
          readonly chatId?: string;
          readonly presence: DocumentPresenceEntry;
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
    readonly audience?: MessageAudience;
    /** Additional agents to address; requires the "agents" audience. */
    readonly agentUserIds?: readonly string[];
}

export interface CreateChannelInput {
    readonly kind: "public_channel" | "private_channel";
    readonly name: string;
    readonly slug: string;
    readonly topic?: string;
    readonly autoJoin?: boolean;
}

export interface CreateChildChannelInput {
    readonly parentChatId: string;
    readonly name: string;
    readonly slug: string;
    readonly topic?: string;
    /** Optional agent model for the child's independent session; omit for the server default. */
    readonly agentModelId?: string;
}

export interface AgentModelSummary {
    readonly id: string;
    readonly name: string;
    readonly thinkingLevels: readonly string[];
    readonly defaultThinkingLevel: string;
}

export interface AgentModelCatalog {
    readonly defaultModelId: string;
    readonly models: readonly AgentModelSummary[];
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
    readonly subagents: readonly AgentTurnSubagentSummary[];
    readonly backgroundTerminals: readonly AgentTurnBackgroundTerminalSummary[];
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
