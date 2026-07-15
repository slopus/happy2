import {
    assertRealtimeEvent,
    assertRealtimeId,
    assertRealtimeTopic,
    DEFAULT_REALTIME_LIMITS,
    realtimeTopics,
    type PresenceChange,
    type PresenceEvent,
    type PresenceSnapshot,
    type RealtimeEvent,
    type RealtimeLimits,
    type RealtimeTopic,
} from "./events.js";
import {
    PubSubClosedError,
    type PresenceConnection,
    type PubSub,
    type RealtimeSubscriber,
    type Unsubscribe,
} from "./pubsub.js";

export interface SubscriberErrorContext {
    readonly topic: RealtimeTopic;
    readonly event: RealtimeEvent;
}

export interface LocalPubSubOptions {
    readonly clock?: () => number;
    readonly limits?: Partial<RealtimeLimits>;
    readonly onSubscriberError?: (
        error: unknown,
        context: SubscriberErrorContext,
    ) => void | Promise<void>;
}

interface LocalConnection {
    readonly connectionId: string;
    readonly userId: string;
    lastActiveAt: number;
}

/** In-memory, process-local pubsub. All state disappears on close or restart. */
export class LocalPubSub implements PubSub {
    private readonly clock: () => number;
    private readonly limits: RealtimeLimits;
    private readonly onSubscriberError?: LocalPubSubOptions["onSubscriberError"];
    private readonly subscribers = new Map<RealtimeTopic, Set<RealtimeSubscriber>>();
    private readonly connections = new Map<string, LocalConnection>();
    private readonly connectionsByUser = new Map<string, Set<string>>();
    private readonly lastActivityByUser = new Map<string, number>();
    private closed = false;

    constructor(options: LocalPubSubOptions = {}) {
        this.clock = options.clock ?? Date.now;
        this.limits = { ...DEFAULT_REALTIME_LIMITS, ...options.limits };
        this.onSubscriberError = options.onSubscriberError;
        assertLimits(this.limits);
    }

    async publish(topic: RealtimeTopic, event: RealtimeEvent): Promise<void> {
        this.assertOpen();
        assertRealtimeTopic(topic, this.limits);
        assertRealtimeEvent(event, this.limits);
        const safeEvent = deepFreeze(structuredClone(event));
        const subscribers = [...(this.subscribers.get(topic) ?? [])];
        await Promise.all(
            subscribers.map(async (subscriber) => {
                try {
                    await subscriber(safeEvent);
                } catch (error) {
                    this.reportSubscriberError(error, { topic, event: safeEvent });
                }
            }),
        );
    }

    subscribe(topic: RealtimeTopic, subscriber: RealtimeSubscriber): Unsubscribe {
        this.assertOpen();
        assertRealtimeTopic(topic, this.limits);
        if (typeof subscriber !== "function") throw new Error("Subscriber must be a function");
        const subscribers = this.subscribers.get(topic) ?? new Set<RealtimeSubscriber>();
        subscribers.add(subscriber);
        this.subscribers.set(topic, subscribers);
        let subscribed = true;
        return () => {
            if (!subscribed) return;
            subscribed = false;
            subscribers.delete(subscriber);
            if (subscribers.size === 0) this.subscribers.delete(topic);
        };
    }

    async connectPresence(connection: PresenceConnection): Promise<PresenceSnapshot> {
        this.assertOpen();
        assertRealtimeId(connection.connectionId, "connection id", this.limits);
        assertRealtimeId(connection.userId, "user id", this.limits);
        const occurredAt = this.occurredAt(connection.occurredAt);
        const existing = this.connections.get(connection.connectionId);
        if (existing) {
            if (existing.userId !== connection.userId)
                throw new Error("Presence connection id is already in use");
            if (occurredAt > existing.lastActiveAt) {
                existing.lastActiveAt = occurredAt;
                this.rememberActivity(existing.userId, occurredAt);
            }
            return this.snapshot(existing.userId);
        }

        const local: LocalConnection = {
            connectionId: connection.connectionId,
            userId: connection.userId,
            lastActiveAt: occurredAt,
        };
        this.connections.set(local.connectionId, local);
        const userConnections = this.connectionsByUser.get(local.userId) ?? new Set<string>();
        userConnections.add(local.connectionId);
        this.connectionsByUser.set(local.userId, userConnections);
        this.rememberActivity(local.userId, occurredAt);
        return this.emitPresence("connected", local.userId, occurredAt);
    }

    async recordPresenceActivity(
        connectionId: string,
        occurredAt?: number,
    ): Promise<PresenceSnapshot | undefined> {
        this.assertOpen();
        assertRealtimeId(connectionId, "connection id", this.limits);
        const connection = this.connections.get(connectionId);
        if (!connection) return undefined;
        const time = this.occurredAt(occurredAt);
        connection.lastActiveAt = Math.max(connection.lastActiveAt, time);
        this.rememberActivity(connection.userId, connection.lastActiveAt);
        return this.emitPresence("activity", connection.userId, time);
    }

    async disconnectPresence(
        connectionId: string,
        occurredAt?: number,
    ): Promise<PresenceSnapshot | undefined> {
        this.assertOpen();
        assertRealtimeId(connectionId, "connection id", this.limits);
        const connection = this.connections.get(connectionId);
        if (!connection) return undefined;
        const time = this.occurredAt(occurredAt);
        this.connections.delete(connectionId);
        const userConnections = this.connectionsByUser.get(connection.userId);
        userConnections?.delete(connectionId);
        if (userConnections?.size === 0) this.connectionsByUser.delete(connection.userId);
        this.rememberActivity(connection.userId, Math.max(connection.lastActiveAt, time));
        return this.emitPresence("disconnected", connection.userId, time);
    }

    async getPresenceSnapshot(userIds?: readonly string[]): Promise<readonly PresenceSnapshot[]> {
        this.assertOpen();
        const ids = userIds
            ? [...userIds]
            : [...new Set([...this.connectionsByUser.keys(), ...this.lastActivityByUser.keys()])];
        for (const userId of ids) assertRealtimeId(userId, "user id", this.limits);
        return ids.map((userId) => this.snapshot(userId));
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.subscribers.clear();
        this.connections.clear();
        this.connectionsByUser.clear();
        this.lastActivityByUser.clear();
    }

    private async emitPresence(
        change: PresenceChange,
        userId: string,
        occurredAt: number,
    ): Promise<PresenceSnapshot> {
        const snapshot = this.snapshot(userId);
        const event: PresenceEvent = { type: "presence", change, snapshot, occurredAt };
        await this.publish(realtimeTopics.presence, event);
        return snapshot;
    }

    private snapshot(userId: string): PresenceSnapshot {
        const connectionCount = this.connectionsByUser.get(userId)?.size ?? 0;
        return Object.freeze({
            userId,
            status: connectionCount > 0 ? "online" : "offline",
            connectionCount,
            lastActiveAt: this.lastActivityByUser.get(userId),
        });
    }

    private rememberActivity(userId: string, occurredAt: number): void {
        this.lastActivityByUser.set(
            userId,
            Math.max(this.lastActivityByUser.get(userId) ?? 0, occurredAt),
        );
        while (this.lastActivityByUser.size > this.limits.maxPresenceUsers) {
            const removable = [...this.lastActivityByUser.keys()].find(
                (candidate) => !this.connectionsByUser.has(candidate),
            );
            if (!removable) break;
            this.lastActivityByUser.delete(removable);
        }
    }

    private occurredAt(value: number | undefined): number {
        const result = value ?? this.clock();
        if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid presence time");
        return result;
    }

    private assertOpen(): void {
        if (this.closed) throw new PubSubClosedError();
    }

    private reportSubscriberError(error: unknown, context: SubscriberErrorContext): void {
        try {
            const reported = this.onSubscriberError?.(error, context);
            if (reported) void reported.catch(() => undefined);
        } catch {
            // Subscriber error reporting must never break fanout.
        }
    }
}

function deepFreeze<T>(value: T): T {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

function assertLimits(limits: RealtimeLimits): void {
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new Error(`Realtime limit ${name} must be a positive safe integer`);
    }
}
