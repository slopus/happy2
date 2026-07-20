/**
 * Realtime events are delivery hints only. The sync event points clients at
 * durable database state; agent activity, typing, presence, and call signaling
 * are ephemeral.
 */
import type {
    AgentTurnBackgroundTerminalSummary,
    AgentTurnSubagentSummary,
} from "../agent/types.js";

export interface RealtimeLimits {
    maxEventBytes: number;
    maxIdLength: number;
    maxSyncChats: number;
    maxSyncAreas: number;
    maxAreaLength: number;
    maxTypingTtlMs: number;
    maxAgentActivityTtlMs: number;
    maxSessionDescriptionBytes: number;
    maxIceCandidateBytes: number;
    maxPresenceUsers: number;
    maxPresenceTtlMs: number;
    maxDocumentPresenceStateBytes: number;
    maxDocumentPresenceTtlMs: number;
}

export const DEFAULT_REALTIME_LIMITS: Readonly<RealtimeLimits> = Object.freeze({
    maxEventBytes: 64 * 1024,
    maxIdLength: 128,
    maxSyncChats: 256,
    maxSyncAreas: 64,
    maxAreaLength: 64,
    maxTypingTtlMs: 30_000,
    maxAgentActivityTtlMs: 30_000,
    maxSessionDescriptionBytes: 48 * 1024,
    maxIceCandidateBytes: 8 * 1024,
    maxPresenceUsers: 10_000,
    maxPresenceTtlMs: 60_000,
    maxDocumentPresenceStateBytes: 8 * 1024,
    maxDocumentPresenceTtlMs: 30_000,
});

/** An unsigned SQLite INTEGER encoded losslessly for JSON transport. */
export type RealtimeSequence = string;

export interface ChatSyncPoint {
    readonly chatId: string;
    readonly pts: RealtimeSequence;
}

export interface SyncHintEvent {
    readonly type: "sync";
    readonly sequence: RealtimeSequence;
    readonly chats: readonly ChatSyncPoint[];
    readonly areas: readonly string[];
}

export type DurableSyncHintEvent = SyncHintEvent;

export interface TypingEvent {
    readonly type: "typing";
    readonly chatId: string;
    readonly userId: string;
    readonly active: boolean;
    readonly occurredAt: number;
    /** Required for active typing and intentionally short-lived. */
    readonly expiresAt?: number;
}

export type AgentActivityPhase = "thinking" | "typing";

/**
 * Short-lived progress for one agent turn. Clients must expire active entries
 * locally and must not reconcile this event through durable sync state.
 */
export interface AgentActivityEvent {
    readonly type: "agent.activity";
    readonly chatId: string;
    readonly agentUserId: string;
    /** The user message that caused this turn, used as its stable public identity. */
    readonly turnId: string;
    readonly active: boolean;
    readonly phase: AgentActivityPhase;
    /** Total model tokens reported for this turn so far. */
    readonly tokenCount: number;
    readonly startedAt: number;
    readonly occurredAt: number;
    readonly subagents: readonly AgentTurnSubagentSummary[];
    readonly backgroundTerminals: readonly AgentTurnBackgroundTerminalSummary[];
    /** Required for active activity and intentionally short-lived. */
    readonly expiresAt?: number;
}

export type PresenceStatus = "online" | "offline";

export interface PresenceSnapshot {
    readonly userId: string;
    readonly status: PresenceStatus;
    readonly connectionCount: number;
    readonly lastSeenAt?: number;
    /** Required while online so each observer can expire a silent lease locally. */
    readonly expiresAt?: number;
}

export type PresenceChange = "activity" | "expired" | "disconnected";

export interface PresenceEvent {
    readonly type: "presence";
    readonly change: PresenceChange;
    readonly snapshot: PresenceSnapshot;
    readonly occurredAt: number;
}

export interface WebRtcSessionDescriptionSignal {
    readonly kind: "offer" | "answer";
    readonly sdp: string;
}

export interface WebRtcIceCandidateSignal {
    readonly kind: "ice-candidate";
    readonly candidate: string;
    readonly sdpMid?: string | null;
    readonly sdpMLineIndex?: number | null;
    readonly usernameFragment?: string | null;
}

export interface WebRtcHangupSignal {
    readonly kind: "hangup";
    readonly reason?: "ended" | "declined" | "busy" | "failed";
}

export type WebRtcSignal =
    | WebRtcSessionDescriptionSignal
    | WebRtcIceCandidateSignal
    | WebRtcHangupSignal;

export interface CallSignalEvent {
    readonly type: "call.signal";
    readonly callId: string;
    readonly chatId: string;
    readonly senderUserId: string;
    /** Omit for a signal addressed to every authorized call participant. */
    readonly recipientUserId?: string;
    readonly signal: WebRtcSignal;
    readonly occurredAt: number;
}

/** Ephemeral invalidation only; clients reconcile the current tree through HTTP. */
export interface WorkspaceChangedEvent {
    readonly type: "workspace.changed";
    readonly chatId: string;
    readonly occurredAt: number;
}

/**
 * Hint that a collaborative document accepted new content. Clients reconcile
 * durable content through the document getDifference endpoint, never from this event.
 */
export interface DocumentUpdatedEvent {
    readonly type: "document.updated";
    readonly chatId: string;
    readonly documentId: string;
    readonly sequence: RealtimeSequence;
    readonly occurredAt: number;
}

/** One editing participant of a collaborative document, expired locally by each observer. */
export interface DocumentPresenceSnapshot {
    readonly documentId: string;
    readonly userId: string;
    readonly clientId: string;
    /** Monotonic per client so stale out-of-order deliveries are discarded. */
    readonly revision: number;
    readonly active: boolean;
    /** Opaque editor awareness payload (cursor, selection, identity). */
    readonly state?: unknown;
    /** Required while active so observers can expire a silent participant. */
    readonly expiresAt?: number;
}

export interface DocumentPresenceEvent {
    readonly type: "document.presence";
    readonly chatId: string;
    readonly presence: DocumentPresenceSnapshot;
    readonly occurredAt: number;
}

export type RealtimeEvent =
    | SyncHintEvent
    | TypingEvent
    | AgentActivityEvent
    | PresenceEvent
    | CallSignalEvent
    | WorkspaceChangedEvent
    | DocumentUpdatedEvent
    | DocumentPresenceEvent;
export type RealtimeEventType = RealtimeEvent["type"];

export type RealtimeTopic =
    | "server"
    | "presence"
    | `user:${string}`
    | `chat:${string}`
    | `call:${string}`;

export const realtimeTopics = Object.freeze({
    server: "server" as const,
    presence: "presence" as const,
    user: (userId: string): RealtimeTopic => scopedTopic("user", userId),
    chat: (chatId: string): RealtimeTopic => scopedTopic("chat", chatId),
    call: (callId: string): RealtimeTopic => scopedTopic("call", callId),
});

export function assertRealtimeTopic(
    topic: string,
    limits: RealtimeLimits = DEFAULT_REALTIME_LIMITS,
): asserts topic is RealtimeTopic {
    if (topic === "server" || topic === "presence") return;
    const match = /^(user|chat|call):(.+)$/.exec(topic);
    if (!match) throw new Error("Invalid realtime topic");
    assertRealtimeId(match[2], "topic id", limits);
}

export function assertRealtimeEvent(
    event: RealtimeEvent,
    limits: RealtimeLimits = DEFAULT_REALTIME_LIMITS,
): void {
    let encoded: string;
    try {
        encoded = JSON.stringify(event);
    } catch {
        throw new Error("Realtime event must be JSON serializable");
    }
    if (!encoded || Buffer.byteLength(encoded) > limits.maxEventBytes)
        throw new Error(`Realtime event exceeds ${limits.maxEventBytes} bytes`);

    switch (event.type) {
        case "sync":
            assertSequence(event.sequence, "sequence");
            if (!Array.isArray(event.chats) || event.chats.length > limits.maxSyncChats)
                throw new Error(`Sync hint may include at most ${limits.maxSyncChats} chats`);
            if (!Array.isArray(event.areas) || event.areas.length > limits.maxSyncAreas)
                throw new Error(`Sync hint may include at most ${limits.maxSyncAreas} areas`);
            assertUnique(
                event.chats.map((chat) => chat.chatId),
                "sync chat ids",
            );
            for (const chat of event.chats) {
                assertRealtimeId(chat.chatId, "chat id", limits);
                assertSequence(chat.pts, "chat pts");
            }
            assertUnique(event.areas, "sync areas");
            for (const area of event.areas) {
                if (
                    typeof area !== "string" ||
                    !/^[a-z][a-z0-9_.-]*$/.test(area) ||
                    area.length > limits.maxAreaLength
                )
                    throw new Error("Invalid sync area");
            }
            return;
        case "typing":
            assertRealtimeId(event.chatId, "chat id", limits);
            assertRealtimeId(event.userId, "user id", limits);
            assertTimestamp(event.occurredAt, "typing occurredAt");
            if (event.active && event.expiresAt === undefined)
                throw new Error("Active typing event requires expiresAt");
            if (event.expiresAt !== undefined) {
                assertTimestamp(event.expiresAt, "typing expiresAt");
                if (
                    event.expiresAt < event.occurredAt ||
                    event.expiresAt - event.occurredAt > limits.maxTypingTtlMs
                )
                    throw new Error(`Typing expiry must be within ${limits.maxTypingTtlMs} ms`);
            }
            return;
        case "agent.activity":
            assertRealtimeId(event.chatId, "chat id", limits);
            assertRealtimeId(event.agentUserId, "agent user id", limits);
            assertRealtimeId(event.turnId, "agent turn id", limits);
            if (typeof event.active !== "boolean")
                throw new Error("Agent activity active must be a boolean");
            if (event.phase !== "thinking" && event.phase !== "typing")
                throw new Error("Invalid agent activity phase");
            if (!Number.isSafeInteger(event.tokenCount) || event.tokenCount < 0)
                throw new Error("Agent activity token count must be a non-negative integer");
            assertTimestamp(event.startedAt, "agent activity startedAt");
            assertTimestamp(event.occurredAt, "agent activity occurredAt");
            if (event.startedAt > event.occurredAt)
                throw new Error("Agent activity cannot occur before the turn started");
            if (!Array.isArray(event.subagents) || event.subagents.length > 32)
                throw new Error("Agent activity may include at most 32 subagents");
            if (!Array.isArray(event.backgroundTerminals) || event.backgroundTerminals.length > 32)
                throw new Error("Agent activity may include at most 32 background terminals");
            assertUnique(
                event.subagents.map((subagent) => subagent.id),
                "agent activity subagent ids",
            );
            for (const subagent of event.subagents) {
                assertRealtimeId(subagent.id, "subagent id", limits);
                if (!Number.isSafeInteger(subagent.depth) || subagent.depth < 1)
                    throw new Error("Subagent depth must be a positive integer");
                assertActivityText(subagent.description, "subagent description");
                if (subagent.latestText !== undefined)
                    assertActivityText(subagent.latestText, "subagent latest text");
                if (
                    ![
                        "idle",
                        "queued",
                        "running",
                        "completed",
                        "aborted",
                        "suspended",
                        "error",
                    ].includes(subagent.status)
                )
                    throw new Error("Invalid subagent status");
                assertTimestamp(subagent.startedAt, "subagent startedAt");
                if (!Number.isSafeInteger(subagent.totalTokens) || subagent.totalTokens < 0)
                    throw new Error("Subagent token count must be a non-negative integer");
            }
            assertUnique(
                event.backgroundTerminals.map((terminal) => terminal.id),
                "agent activity background terminal ids",
            );
            for (const terminal of event.backgroundTerminals) {
                assertRealtimeId(terminal.id, "background terminal id", limits);
                assertActivityText(terminal.command, "background terminal command", 1_000);
                assertActivityText(terminal.cwd, "background terminal cwd", 1_000);
                assertTimestamp(terminal.startedAt, "background terminal startedAt");
            }
            if (event.active && event.expiresAt === undefined)
                throw new Error("Active agent activity requires expiresAt");
            if (event.expiresAt !== undefined) {
                assertTimestamp(event.expiresAt, "agent activity expiresAt");
                if (
                    event.expiresAt < event.occurredAt ||
                    event.expiresAt - event.occurredAt > limits.maxAgentActivityTtlMs
                )
                    throw new Error(
                        `Agent activity expiry must be within ${limits.maxAgentActivityTtlMs} ms`,
                    );
            }
            return;
        case "presence":
            assertTimestamp(event.occurredAt, "presence occurredAt");
            if (!(["activity", "expired", "disconnected"] as unknown[]).includes(event.change))
                throw new Error("Invalid presence change");
            assertPresenceSnapshot(event.snapshot, limits);
            return;
        case "call.signal":
            assertRealtimeId(event.callId, "call id", limits);
            assertRealtimeId(event.chatId, "chat id", limits);
            assertRealtimeId(event.senderUserId, "sender user id", limits);
            if (event.recipientUserId !== undefined)
                assertRealtimeId(event.recipientUserId, "recipient user id", limits);
            assertTimestamp(event.occurredAt, "call occurredAt");
            assertCallSignal(event.signal, limits);
            return;
        case "workspace.changed":
            assertRealtimeId(event.chatId, "chat id", limits);
            assertTimestamp(event.occurredAt, "workspace change occurredAt");
            return;
        case "document.updated":
            assertRealtimeId(event.chatId, "chat id", limits);
            assertRealtimeId(event.documentId, "document id", limits);
            assertSequence(event.sequence, "document sequence");
            assertTimestamp(event.occurredAt, "document update occurredAt");
            return;
        case "document.presence":
            assertRealtimeId(event.chatId, "chat id", limits);
            assertTimestamp(event.occurredAt, "document presence occurredAt");
            assertDocumentPresenceSnapshot(event.presence, event.occurredAt, limits);
            return;
        default:
            throw new Error("Invalid realtime event type");
    }
}

function assertActivityText(
    value: unknown,
    name: string,
    maxLength = 500,
): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength)
        throw new Error(`Invalid ${name}`);
}

export function assertRealtimeId(
    value: string | undefined,
    name: string,
    limits: RealtimeLimits = DEFAULT_REALTIME_LIMITS,
): asserts value is string {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > limits.maxIdLength ||
        [...value].some((character) => {
            const code = character.charCodeAt(0);
            return code <= 31 || code === 127;
        })
    )
        throw new Error(`Invalid ${name}`);
}

export function assertSequence(value: string, name = "sequence"): void {
    if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
        throw new Error(`${name} must be an unsigned decimal string`);
    if (value.length > 19 || BigInt(value) > 9_223_372_036_854_775_807n)
        throw new Error(`${name} exceeds SQLite INTEGER range`);
}

function scopedTopic(scope: "user" | "chat" | "call", id: string): RealtimeTopic {
    assertRealtimeId(id, `${scope} id`);
    return `${scope}:${id}`;
}

function assertPresenceSnapshot(snapshot: PresenceSnapshot, limits: RealtimeLimits): void {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid presence snapshot");
    assertRealtimeId(snapshot.userId, "presence user id", limits);
    if (snapshot.status !== "online" && snapshot.status !== "offline")
        throw new Error("Invalid presence status");
    if (!Number.isSafeInteger(snapshot.connectionCount) || snapshot.connectionCount < 0)
        throw new Error("Invalid presence connection count");
    if (snapshot.status === "online" && snapshot.connectionCount === 0)
        throw new Error("Online presence requires a connection");
    if (snapshot.status === "offline" && snapshot.connectionCount !== 0)
        throw new Error("Offline presence cannot have connections");
    if (snapshot.lastSeenAt !== undefined)
        assertTimestamp(snapshot.lastSeenAt, "presence lastSeenAt");
    if (snapshot.status === "online" && snapshot.expiresAt === undefined)
        throw new Error("Online presence requires expiresAt");
    if (snapshot.status === "offline" && snapshot.expiresAt !== undefined)
        throw new Error("Offline presence cannot have expiresAt");
    if (snapshot.expiresAt !== undefined) {
        assertTimestamp(snapshot.expiresAt, "presence expiresAt");
        if (
            snapshot.lastSeenAt === undefined ||
            snapshot.expiresAt < snapshot.lastSeenAt ||
            snapshot.expiresAt - snapshot.lastSeenAt > limits.maxPresenceTtlMs
        )
            throw new Error(
                `Presence expiry must be within ${limits.maxPresenceTtlMs} ms of last seen`,
            );
    }
}

function assertDocumentPresenceSnapshot(
    snapshot: DocumentPresenceSnapshot,
    occurredAt: number,
    limits: RealtimeLimits,
): void {
    if (!snapshot || typeof snapshot !== "object")
        throw new Error("Invalid document presence snapshot");
    assertRealtimeId(snapshot.documentId, "document id", limits);
    assertRealtimeId(snapshot.userId, "presence user id", limits);
    assertRealtimeId(snapshot.clientId, "presence client id", limits);
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0)
        throw new Error("Document presence revision must be a non-negative integer");
    if (typeof snapshot.active !== "boolean")
        throw new Error("Document presence active must be a boolean");
    if (snapshot.state !== undefined) {
        let encoded: string;
        try {
            encoded = JSON.stringify(snapshot.state);
        } catch {
            throw new Error("Document presence state must be JSON serializable");
        }
        if (
            encoded === undefined ||
            Buffer.byteLength(encoded) > limits.maxDocumentPresenceStateBytes
        )
            throw new Error(
                `Document presence state exceeds ${limits.maxDocumentPresenceStateBytes} bytes`,
            );
    }
    if (snapshot.active && snapshot.expiresAt === undefined)
        throw new Error("Active document presence requires expiresAt");
    if (!snapshot.active && snapshot.expiresAt !== undefined)
        throw new Error("Inactive document presence cannot have expiresAt");
    if (snapshot.expiresAt !== undefined) {
        assertTimestamp(snapshot.expiresAt, "document presence expiresAt");
        if (
            snapshot.expiresAt < occurredAt ||
            snapshot.expiresAt - occurredAt > limits.maxDocumentPresenceTtlMs
        )
            throw new Error(
                `Document presence expiry must be within ${limits.maxDocumentPresenceTtlMs} ms`,
            );
    }
}

function assertCallSignal(signal: WebRtcSignal, limits: RealtimeLimits): void {
    if (!signal || typeof signal !== "object") throw new Error("Invalid WebRTC signal");
    if (signal.kind === "offer" || signal.kind === "answer") {
        assertBoundedString(signal.sdp, "session description", limits.maxSessionDescriptionBytes);
        return;
    }
    if (signal.kind === "ice-candidate") {
        assertBoundedString(signal.candidate, "ICE candidate", limits.maxIceCandidateBytes, true);
        if (signal.sdpMid !== undefined && signal.sdpMid !== null)
            assertBoundedString(signal.sdpMid, "ICE sdpMid", 256, true);
        if (
            signal.sdpMLineIndex !== undefined &&
            signal.sdpMLineIndex !== null &&
            (!Number.isSafeInteger(signal.sdpMLineIndex) || signal.sdpMLineIndex < 0)
        )
            throw new Error("Invalid ICE sdpMLineIndex");
        if (signal.usernameFragment !== undefined && signal.usernameFragment !== null)
            assertBoundedString(signal.usernameFragment, "ICE username fragment", 256, true);
        return;
    }
    if (signal.kind === "hangup") {
        if (
            signal.reason !== undefined &&
            !("ended,declined,busy,failed".split(",") as unknown[]).includes(signal.reason)
        )
            throw new Error("Invalid call hangup reason");
        return;
    }
    throw new Error("Invalid WebRTC signal kind");
}

function assertTimestamp(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
}

function assertBoundedString(
    value: string,
    name: string,
    maximumBytes: number,
    allowEmpty = false,
): void {
    if (
        typeof value !== "string" ||
        (!allowEmpty && value.length === 0) ||
        Buffer.byteLength(value) > maximumBytes
    )
        throw new Error(`Invalid ${name}`);
}

function assertUnique(values: readonly string[], name: string): void {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${name}`);
}
