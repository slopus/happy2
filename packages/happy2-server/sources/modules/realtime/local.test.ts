import { describe, expect, it, vi } from "vitest";
import {
    LocalPubSub,
    PubSubClosedError,
    realtimeTopics,
    type AgentActivityEvent,
    type CallSignalEvent,
    type PresenceEvent,
    type RealtimeEvent,
    type SyncHintEvent,
    type TypingEvent,
} from "./index.js";

const syncEvent: SyncHintEvent = {
    type: "sync",
    sequence: "9007199254740993",
    chats: [{ chatId: "chat-one", pts: "9007199254740992" }],
    areas: ["messages"],
};

describe("LocalPubSub contract", () => {
    it("fans out by topic, awaits async subscribers, and unsubscribes idempotently", async () => {
        const pubsub = new LocalPubSub();
        const received: RealtimeEvent[] = [];
        const listener = vi.fn(async (event: RealtimeEvent) => {
            await Promise.resolve();
            received.push(event);
        });
        const unsubscribe = pubsub.subscribe(realtimeTopics.user("user-one"), listener);

        await pubsub.publish(realtimeTopics.chat("chat-one"), syncEvent);
        await pubsub.publish(realtimeTopics.user("user-one"), syncEvent);
        expect(received).toEqual([syncEvent]);
        expect(Object.isFrozen(received[0])).toBe(true);
        expect(Object.isFrozen((received[0] as SyncHintEvent).chats)).toBe(true);

        unsubscribe();
        unsubscribe();
        await pubsub.publish(realtimeTopics.user("user-one"), syncEvent);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("isolates subscriber failures so every async subscriber receives the event", async () => {
        const errors: unknown[] = [];
        const pubsub = new LocalPubSub({
            onSubscriberError: (error) => {
                errors.push(error);
            },
        });
        const delivered = vi.fn();
        pubsub.subscribe(realtimeTopics.server, async () => {
            await Promise.resolve();
            throw new Error("listener failed");
        });
        pubsub.subscribe(realtimeTopics.server, delivered);

        await expect(pubsub.publish(realtimeTopics.server, syncEvent)).resolves.toBeUndefined();
        expect(delivered).toHaveBeenCalledWith(syncEvent);
        expect(errors).toHaveLength(1);
    });

    it("consumes asynchronous subscriber-error reporter failures", async () => {
        const pubsub = new LocalPubSub({
            onSubscriberError: async () => {
                throw new Error("reporter failed");
            },
        });
        pubsub.subscribe(realtimeTopics.server, () => {
            throw new Error("subscriber failed");
        });
        await expect(pubsub.publish(realtimeTopics.server, syncEvent)).resolves.toBeUndefined();
        await Promise.resolve();
    });

    it("bounds retained offline presence history", async () => {
        let now = 1;
        const pubsub = new LocalPubSub({
            clock: () => now++,
            limits: { maxPresenceUsers: 2 },
        });
        for (const userId of ["one", "two", "three"]) {
            const connectionId = `connection-${userId}`;
            await pubsub.connectPresence({ connectionId, userId });
            await pubsub.recordPresenceActivity(connectionId);
            await pubsub.disconnectPresence(connectionId);
        }
        expect(await pubsub.getPresenceSnapshot()).toHaveLength(2);
    });

    it("accepts lossless SQLite sequences and rejects malformed or oversized hints", async () => {
        const pubsub = new LocalPubSub({ limits: { maxSyncChats: 1 } });
        await expect(pubsub.publish(realtimeTopics.server, syncEvent)).resolves.toBeUndefined();

        await expect(
            pubsub.publish(realtimeTopics.server, { ...syncEvent, sequence: "01" }),
        ).rejects.toThrow("unsigned decimal string");
        await expect(
            pubsub.publish(realtimeTopics.server, {
                ...syncEvent,
                chats: [...syncEvent.chats, { chatId: "chat-two", pts: "1" }],
            }),
        ).rejects.toThrow("at most 1 chats");
        await expect(
            pubsub.publish(realtimeTopics.server, {
                type: "unknown",
            } as unknown as RealtimeEvent),
        ).rejects.toThrow("Invalid realtime event type");
    });

    it("enforces typing expiry and WebRTC signaling bounds", async () => {
        const pubsub = new LocalPubSub({
            limits: { maxTypingTtlMs: 5_000, maxSessionDescriptionBytes: 16 },
        });
        const typing: TypingEvent = {
            type: "typing",
            chatId: "chat-one",
            userId: "user-one",
            active: true,
            occurredAt: 1_000,
            expiresAt: 6_000,
        };
        const activity: AgentActivityEvent = {
            type: "agent.activity",
            chatId: "chat-one",
            agentUserId: "agent-one",
            turnId: "turn-one",
            active: true,
            phase: "thinking",
            tokenCount: 42,
            startedAt: 900,
            occurredAt: 1_000,
            expiresAt: 6_000,
            subagents: [],
            backgroundTerminals: [],
        };
        const offer: CallSignalEvent = {
            type: "call.signal",
            callId: "call-one",
            chatId: "chat-one",
            senderUserId: "user-one",
            recipientUserId: "user-two",
            signal: { kind: "offer", sdp: "v=0" },
            occurredAt: 1_000,
        };

        await expect(
            pubsub.publish(realtimeTopics.chat("chat-one"), typing),
        ).resolves.toBeUndefined();
        await expect(
            pubsub.publish(realtimeTopics.chat("chat-one"), activity),
        ).resolves.toBeUndefined();
        await expect(
            pubsub.publish(realtimeTopics.call("call-one"), offer),
        ).resolves.toBeUndefined();
        await expect(
            pubsub.publish(realtimeTopics.chat("chat-one"), {
                ...typing,
                expiresAt: 6_001,
            }),
        ).rejects.toThrow("within 5000 ms");
        await expect(
            pubsub.publish(realtimeTopics.chat("chat-one"), {
                ...activity,
                tokenCount: -1,
            }),
        ).rejects.toThrow("non-negative integer");
        await expect(
            pubsub.publish(realtimeTopics.call("call-one"), {
                ...offer,
                signal: { kind: "offer", sdp: "x".repeat(17) },
            }),
        ).rejects.toThrow("session description");
    });

    it("keeps transport registration offline and tracks explicit presence leases", async () => {
        let now = 100;
        const pubsub = new LocalPubSub({ clock: () => now });
        const events: PresenceEvent[] = [];
        pubsub.subscribe(realtimeTopics.presence, (event) => {
            if (event.type === "presence") events.push(event);
        });

        await expect(
            pubsub.connectPresence({ connectionId: "connection-one", userId: "user-one" }),
        ).resolves.toEqual({
            userId: "user-one",
            status: "offline",
            connectionCount: 0,
            lastSeenAt: undefined,
            expiresAt: undefined,
        });
        now = 110;
        await pubsub.connectPresence({ connectionId: "connection-two", userId: "user-one" });
        now = 120;
        await pubsub.recordPresenceActivity("connection-one");
        now = 130;
        await pubsub.recordPresenceActivity("connection-two");
        now = 140;
        await pubsub.disconnectPresence("connection-one");
        expect(await pubsub.getPresenceSnapshot(["user-one", "never-online"])).toEqual([
            {
                userId: "user-one",
                status: "online",
                connectionCount: 1,
                lastSeenAt: 130,
                expiresAt: 60_130,
            },
            {
                userId: "never-online",
                status: "offline",
                connectionCount: 0,
                lastSeenAt: undefined,
                expiresAt: undefined,
            },
        ]);

        now = 150;
        await pubsub.disconnectPresence("connection-two");
        expect(await pubsub.getPresenceSnapshot(["user-one"])).toEqual([
            {
                userId: "user-one",
                status: "offline",
                connectionCount: 0,
                lastSeenAt: 130,
                expiresAt: undefined,
            },
        ]);
        expect(events.map((event) => event.change)).toEqual([
            "activity",
            "activity",
            "disconnected",
            "disconnected",
        ]);
    });

    it("expires a silent lease after its observer-visible deadline", async () => {
        let now = 100;
        const pubsub = new LocalPubSub({ clock: () => now, presenceTtlMs: 60 });
        await pubsub.connectPresence({ connectionId: "connection-one", userId: "user-one" });

        now = 110;
        await expect(pubsub.recordPresenceActivity("connection-one")).resolves.toEqual({
            userId: "user-one",
            status: "online",
            connectionCount: 1,
            lastSeenAt: 110,
            expiresAt: 170,
        });
        now = 169;
        expect(await pubsub.getPresenceSnapshot(["user-one"])).toMatchObject([
            { status: "online", expiresAt: 170 },
        ]);
        now = 170;
        expect(await pubsub.getPresenceSnapshot(["user-one"])).toEqual([
            {
                userId: "user-one",
                status: "offline",
                connectionCount: 0,
                lastSeenAt: 110,
                expiresAt: undefined,
            },
        ]);
        await pubsub.close();
    });

    it("stays online until the final active presence connection disconnects", async () => {
        const pubsub = new LocalPubSub({ clock: () => 100 });
        const events: PresenceEvent[] = [];
        pubsub.subscribe(realtimeTopics.presence, (event) => {
            if (event.type === "presence") events.push(event);
        });
        await pubsub.connectPresence({ connectionId: "connection-one", userId: "user-one" });
        await pubsub.connectPresence({ connectionId: "connection-two", userId: "user-one" });
        await pubsub.recordPresenceActivity("connection-one");
        await pubsub.recordPresenceActivity("connection-two");

        await pubsub.disconnectPresence("connection-one");
        expect(events.at(-1)).toMatchObject({
            change: "disconnected",
            snapshot: { status: "online", connectionCount: 1 },
        });
        expect(events.filter((event) => event.snapshot.status === "offline")).toHaveLength(0);

        await pubsub.disconnectPresence("connection-two");
        expect(events.at(-1)).toMatchObject({
            change: "disconnected",
            snapshot: { status: "offline", connectionCount: 0 },
        });
        expect(events.filter((event) => event.snapshot.status === "offline")).toHaveLength(1);
        await pubsub.close();
    });

    it("publishes one offline transition when an active lease expires", async () => {
        const pubsub = new LocalPubSub({ presenceTtlMs: 10 });
        const events: PresenceEvent[] = [];
        pubsub.subscribe(realtimeTopics.presence, (event) => {
            if (event.type === "presence") events.push(event);
        });
        await pubsub.connectPresence({ connectionId: "connection-one", userId: "user-one" });
        await pubsub.recordPresenceActivity("connection-one");

        await vi.waitFor(() => {
            expect(events.map((event) => event.change)).toEqual(["activity", "expired"]);
        });
        expect(events.at(-1)?.snapshot).toMatchObject({
            userId: "user-one",
            status: "offline",
            connectionCount: 0,
        });
        await pubsub.disconnectPresence("connection-one");
        expect(events.map((event) => event.change)).toEqual(["activity", "expired"]);
        await pubsub.close();
    });

    it("makes repeated presence connection safe but rejects cross-user reuse", async () => {
        const pubsub = new LocalPubSub({ clock: () => 100 });
        await pubsub.connectPresence({ connectionId: "same", userId: "user-one" });
        await expect(
            pubsub.connectPresence({ connectionId: "same", userId: "user-one" }),
        ).resolves.toMatchObject({ connectionCount: 0 });
        await expect(
            pubsub.connectPresence({ connectionId: "same", userId: "user-two" }),
        ).rejects.toThrow("already in use");
        await expect(pubsub.recordPresenceActivity("unknown")).resolves.toBeUndefined();
        await expect(pubsub.disconnectPresence("unknown")).resolves.toBeUndefined();
    });

    it("clears subscriptions and ephemeral presence state when closed", async () => {
        const pubsub = new LocalPubSub();
        const listener = vi.fn();
        pubsub.subscribe(realtimeTopics.server, listener);
        await pubsub.connectPresence({ connectionId: "connection-one", userId: "user-one" });

        await pubsub.close();
        await pubsub.close();
        await expect(pubsub.publish(realtimeTopics.server, syncEvent)).rejects.toBeInstanceOf(
            PubSubClosedError,
        );
        await expect(pubsub.getPresenceSnapshot()).rejects.toBeInstanceOf(PubSubClosedError);
        expect(listener).not.toHaveBeenCalled();
    });
});
