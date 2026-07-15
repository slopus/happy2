import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("sync, presence, calls, and API error contracts", () => {
    it("streams ephemeral hints over SSE without treating them as durable cursors", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "sse_contract_admin" });
        const member = await server.createUser({ username: "sse_contract_member" });
        const asAdmin = server.as(admin);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "SSE Contract",
            slug: "sse-contract",
        });
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);

        const baseUrl = await server.listen();
        expect((await fetch(`${baseUrl}/v0/sync/events`)).status).toBe(401);
        const controller = new AbortController();
        const response = await fetch(`${baseUrl}/v0/sync/events`, {
            headers: { authorization: `Bearer ${member.token}` },
            signal: controller.signal,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        const frames = new SseFrames(response.body!.getReader());
        const ready = await frames.next();
        expect(ready.name).toBe("ready");
        expect(ready.data).toMatchObject({ state: { generation: expect.any(String) } });

        const sent = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "A live hint follows the durable commit",
        });
        expect(sent.statusCode).toBe(201);
        const hint = await frames.until((frame) => frame.name === "sync");
        expect(hint.data).toMatchObject({
            sequence: sent.json().sync.sequence,
            chats: [expect.objectContaining({ chatId })],
        });
        controller.abort();
        await frames.cancel();
    });

    it("reconciles common and chat differences through normal user actions", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "sync_contract_admin" });
        const member = await server.createUser({ username: "sync_contract_member" });
        const outsider = await server.createUser({ username: "sync_contract_outsider" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);

        const initial = await asMember.get("/v0/sync/state");
        expect(initial.statusCode).toBe(200);
        const initialState = initial.json().state as { generation: string; sequence: string };
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Sync Contract",
            slug: "sync-contract",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect((await asMember.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(200);
        const memberChat = await asMember.get(`/v0/chats/${chatId}`);
        const memberState = memberChat.json().chat as { membershipEpoch: string; pts: string };

        // A reconnect always starts with durable cursors, never a remembered SSE session.
        await server.restart();
        const message = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "This must arrive through a chat difference",
        });
        expect(message.statusCode).toBe(201);
        const messageId = message.json().message.id as string;

        const common = await asMember.post("/v0/sync/getDifference", {
            state: initialState,
            limit: 100,
        });
        expect(common.statusCode).toBe(200);
        expect(common.json().changedChats).toContainEqual(
            expect.objectContaining({ id: chatId, pts: expect.any(String) }),
        );
        expect(common.json().state.sequence).toMatch(/^\d+$/);
        const chatDifference = await asMember.post(`/v0/chats/${chatId}/getDifference`, {
            state: memberState,
            limit: 100,
        });
        expect(chatDifference.statusCode).toBe(200);
        expect(chatDifference.json().updates).toContainEqual(
            expect.objectContaining({ entityId: messageId, kind: "message.created" }),
        );
        expect(chatDifference.json().messages).toContainEqual(
            expect.objectContaining({
                id: messageId,
                text: "This must arrive through a chat difference",
            }),
        );

        expect(
            (
                await asMember.post("/v0/sync/acknowledge", {
                    deviceId: "gym-desktop",
                    state: common.json().state,
                })
            ).statusCode,
        ).toBe(202);
        const staleGeneration = await asMember.post("/v0/sync/getDifference", {
            state: { generation: "wrong", sequence: "0" },
            limit: 100,
        });
        expect(staleGeneration.statusCode).toBe(200);
        expect(staleGeneration.json()).toMatchObject({ kind: "reset" });
        const staleMembership = await asMember.post(`/v0/chats/${chatId}/getDifference`, {
            state: { membershipEpoch: "wrong", pts: "0" },
            limit: 100,
        });
        expect(staleMembership.statusCode).toBe(200);
        expect(staleMembership.json()).toMatchObject({ kind: "reset" });

        // Public-channel visibility does not grant write-only realtime actions.
        expect(
            (await asOutsider.post(`/v0/chats/${chatId}/setTyping`, { active: true })).statusCode,
        ).toBe(403);
        expect(
            (await asMember.post(`/v0/chats/${chatId}/setTyping`, { active: true, ttlMs: 1_000 }))
                .statusCode,
        ).toBe(202);
        expect(
            (
                await asMember.post(`/v0/chats/${chatId}/setTyping`, {
                    active: true,
                    ttlMs: 30_001,
                })
            ).statusCode,
        ).toBe(400);
    });

    it("enforces call participation and exposes durable status/preferences", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "calls_contract_admin" });
        const member = await server.createUser({ username: "calls_contract_member" });
        const outsider = await server.createUser({ username: "calls_contract_outsider" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Call Contract",
            slug: "call-contract",
        });
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        const call = await asAdmin.post(`/v0/chats/${chatId}/createCall`, {
            kind: "video",
            invitedUserIds: [member.id],
        });
        expect(call.statusCode).toBe(201);
        const callId = call.json().call.id as string;
        expect((await asOutsider.get(`/v0/calls/${callId}`)).statusCode).toBe(404);
        expect((await asMember.post(`/v0/calls/${callId}/joinCall`)).statusCode).toBe(200);
        const signal = await asAdmin.post(`/v0/calls/${callId}/sendSignal`, {
            chatId,
            recipientUserId: member.id,
            signal: { kind: "offer", sdp: "v=0\r\no=happy2 1 1 IN IP4 127.0.0.1" },
        });
        expect(signal.statusCode).toBe(202);
        expect(
            (
                await asAdmin.post(`/v0/calls/${callId}/sendSignal`, {
                    chatId,
                    recipientUserId: outsider.id,
                    signal: {
                        kind: "ice-candidate",
                        candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host",
                    },
                })
            ).statusCode,
        ).toBe(404);
        expect((await asMember.post(`/v0/calls/${callId}/leaveCall`)).statusCode).toBe(200);
        const ended = await asAdmin.post(`/v0/calls/${callId}/endCall`, { reason: "finished" });
        expect(ended.statusCode).toBe(200);
        expect(ended.json().call).toMatchObject({
            id: callId,
            status: "ended",
            endReason: "finished",
        });
        expect((await asAdmin.get(`/v0/calls?chatId=${chatId}`)).json().calls).toContainEqual(
            expect.objectContaining({ id: callId, status: "ended" }),
        );

        expect(
            (
                await asMember.post("/v0/me/updateStatus", {
                    availability: "dnd",
                    customStatusText: "In a focus block",
                    customStatusEmoji: "🧪",
                    dndUntil: new Date(Date.now() + 60_000).toISOString(),
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asMember.post("/v0/me/updateNotificationPreferences", {
                    directMessages: "none",
                    mentions: "all",
                    calls: "none",
                    dndStartMinutes: 60,
                    dndEndMinutes: 120,
                    timezone: "UTC",
                })
            ).statusCode,
        ).toBe(200);
        const preferences = await asMember.get("/v0/me/notificationPreferences");
        expect(preferences.statusCode).toBe(200);
        expect(preferences.json().preferences).toMatchObject({
            directMessages: "none",
            mentions: "all",
            calls: "none",
            dndStartMinutes: 60,
            dndEndMinutes: 120,
            timezone: "UTC",
        });
        const presence = await asAdmin.get("/v0/presence");
        expect(presence.statusCode).toBe(200);
        expect(presence.json().statuses).toContainEqual(
            expect.objectContaining({ userId: member.id, availability: "dnd" }),
        );
        expect(
            (
                await asMember.post("/v0/me/updatePresence", {
                    connectionId: "not-an-sse-connection",
                })
            ).statusCode,
        ).toBe(404);
    });
});

class SseFrames {
    private buffer = "";

    constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

    async next(): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const delimiter = this.buffer.indexOf("\n\n");
            if (delimiter >= 0) {
                const frame = this.buffer.slice(0, delimiter);
                this.buffer = this.buffer.slice(delimiter + 2);
                const name = /^event: ([^\n]+)$/m.exec(frame)?.[1];
                const rawData = /^data: (.*)$/m.exec(frame)?.[1];
                if (name && rawData) return { name, data: JSON.parse(rawData) };
                continue;
            }
            const result = await withTimeout(this.reader.read(), 3_000);
            if (result.done) throw new Error("SSE stream ended before the expected frame");
            this.buffer += new TextDecoder().decode(result.value, { stream: true });
        }
    }

    async until(
        predicate: (frame: { name: string; data: unknown }) => boolean,
    ): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const frame = await this.next();
            if (predicate(frame)) return frame;
        }
    }

    async cancel(): Promise<void> {
        await this.reader.cancel().catch(() => undefined);
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for an SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
