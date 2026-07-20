import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("collaborative document presence", () => {
    it("announces revision-gated ephemeral participants to chat members and expires leavers", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "presence_owner", firstName: "Owner" });
        const partner = await server.createUser({
            username: "presence_partner",
            firstName: "Partner",
        });
        const outsider = await server.createUser({
            username: "presence_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const asPartner = server.as(partner);
        const asOutsider = server.as(outsider);
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Presence studio",
            slug: "presence-studio",
        });
        const chatId = channel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: partner.id });
        const created = await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Presence page",
        });
        const documentId = created.json().document.id as string;

        const partnerStream = new AbortController();
        const partnerResponse = await fetch(`${await server.listen()}/v0/sync/events`, {
            headers: { authorization: `Bearer ${partner.token}` },
            signal: partnerStream.signal,
        });
        const partnerFrames = new SseFrames(partnerResponse.body!.getReader());
        expect((await partnerFrames.next()).name).toBe("ready");

        const announced = await asOwner.post(`/v0/documents/${documentId}/updatePresence`, {
            clientId: "owner-editor-1",
            revision: 1,
            active: true,
            state: { cursor: { anchor: 4, head: 4 }, name: "Owner" },
        });
        expect(announced.statusCode).toBe(200);
        expect(announced.json().accepted).toBe(true);
        expect(announced.json().presence).toHaveLength(1);
        expect(announced.json().presence[0]).toMatchObject({
            documentId,
            userId: owner.id,
            clientId: "owner-editor-1",
            revision: 1,
            active: true,
            state: { cursor: { anchor: 4, head: 4 }, name: "Owner" },
            expiresAt: expect.any(Number),
        });

        const event = await partnerFrames.until((frame) => frame.name === "document.presence");
        expect(event.data).toMatchObject({
            chatId,
            presence: { documentId, userId: owner.id, clientId: "owner-editor-1", revision: 1 },
        });

        const stale = await asOwner.post(`/v0/documents/${documentId}/updatePresence`, {
            clientId: "owner-editor-1",
            revision: 1,
            active: true,
            state: { cursor: { anchor: 9, head: 9 } },
        });
        expect(stale.statusCode).toBe(200);
        expect(stale.json().accepted).toBe(false);
        expect(stale.json().presence[0].state).toMatchObject({
            cursor: { anchor: 4, head: 4 },
        });

        const roster = await asPartner.get(`/v0/documents/${documentId}/presence`);
        expect(roster.statusCode).toBe(200);
        expect(roster.json().presence).toHaveLength(1);

        expect(
            (
                await asOutsider.post(`/v0/documents/${documentId}/updatePresence`, {
                    clientId: "outsider-editor",
                    revision: 1,
                    active: true,
                })
            ).statusCode,
        ).toBe(404);
        expect((await asOutsider.get(`/v0/documents/${documentId}/presence`)).statusCode).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/updatePresence`, {
                    clientId: "owner-editor-1",
                    revision: 3,
                    active: true,
                    state: { padding: "x".repeat(9 * 1024) },
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/updatePresence`, {
                    clientId: "owner-editor-1",
                    revision: 4,
                    active: true,
                    ttlMs: 120_000,
                })
            ).statusCode,
        ).toBe(400);

        const left = await asOwner.post(`/v0/documents/${documentId}/updatePresence`, {
            clientId: "owner-editor-1",
            revision: 5,
            active: false,
        });
        expect(left.statusCode).toBe(200);
        expect(left.json().accepted).toBe(true);
        expect(left.json().presence).toEqual([]);
        const leaveEvent = await partnerFrames.until(
            (frame) =>
                frame.name === "document.presence" &&
                (frame.data as { presence: { revision: number } }).presence.revision === 5,
        );
        expect(leaveEvent.data).toMatchObject({
            presence: { clientId: "owner-editor-1", active: false },
        });
        expect((await asPartner.get(`/v0/documents/${documentId}/presence`)).json().presence).toEqual(
            [],
        );

        partnerStream.abort();
        await partnerFrames.cancel();
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
            if (result.done) throw new Error("Presence SSE stream ended before the expected frame");
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
                    () => reject(new Error("Timed out waiting for a presence SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
