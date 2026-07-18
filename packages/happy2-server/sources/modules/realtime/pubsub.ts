import type { PresenceSnapshot, RealtimeEvent, RealtimeTopic } from "./events.js";

export type RealtimeSubscriber = (event: RealtimeEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface PresenceConnection {
    readonly connectionId: string;
    readonly userId: string;
}

/**
 * Transport-neutral ephemeral fanout. A Redis adapter can implement the same
 * contract without changing route code. No implementation may treat it as the
 * source of truth for sync state.
 */
export interface PubSub {
    publish(topic: RealtimeTopic, event: RealtimeEvent): Promise<void>;
    subscribe(topic: RealtimeTopic, subscriber: RealtimeSubscriber): Unsubscribe;

    connectPresence(connection: PresenceConnection): Promise<PresenceSnapshot>;
    recordPresenceActivity(
        connectionId: string,
        occurredAt?: number,
    ): Promise<PresenceSnapshot | undefined>;
    disconnectPresence(
        connectionId: string,
        occurredAt?: number,
    ): Promise<PresenceSnapshot | undefined>;
    getPresenceSnapshot(userIds?: readonly string[]): Promise<readonly PresenceSnapshot[]>;

    close(): Promise<void>;
}

export class PubSubClosedError extends Error {
    constructor() {
        super("PubSub is closed");
        this.name = "PubSubClosedError";
    }
}
