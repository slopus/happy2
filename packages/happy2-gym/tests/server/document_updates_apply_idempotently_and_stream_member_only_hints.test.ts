import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGymServer } from "../../sources/index.js";

describe("collaborative document updates", () => {
    it("applies Yjs batches idempotently, converges two clients, and hints only chat members", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "edit_owner", firstName: "Owner" });
        const partner = await server.createUser({ username: "edit_partner", firstName: "Partner" });
        const outsider = await server.createUser({
            username: "edit_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const asPartner = server.as(partner);
        const asOutsider = server.as(outsider);
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Editing floor",
            slug: "editing-floor",
        });
        const chatId = channel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: partner.id });
        const created = await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Shared page",
        });
        const documentId = created.json().document.id as string;

        const partnerStream = new AbortController();
        const partnerResponse = await fetch(`${await server.listen()}/v0/sync/events`, {
            headers: { authorization: `Bearer ${partner.token}` },
            signal: partnerStream.signal,
        });
        const partnerFrames = new SseFrames(partnerResponse.body!.getReader());
        expect((await partnerFrames.next()).name).toBe("ready");
        const outsiderStream = new AbortController();
        const outsiderResponse = await fetch(`${await server.listen()}/v0/sync/events`, {
            headers: { authorization: `Bearer ${outsider.token}` },
            signal: outsiderStream.signal,
        });
        const outsiderFrames = new SseFrames(outsiderResponse.body!.getReader());
        expect((await outsiderFrames.next()).name).toBe("ready");

        const ownerDoc = new Y.Doc();
        const ownerText = ownerDoc.getText("content");
        const beforeFirst = Y.encodeStateVector(ownerDoc);
        ownerText.insert(0, "Hello from the owner. ");
        const firstBatch = {
            clientUpdateId: "owner-batch-1",
            updates: [encode(Y.encodeStateAsUpdate(ownerDoc, beforeFirst))],
        };
        const first = await asOwner.post(`/v0/documents/${documentId}/applyUpdates`, firstBatch);
        expect(first.statusCode).toBe(201);
        expect(first.json()).toMatchObject({
            acceptedSequence: "1",
            replayed: false,
            document: { id: documentId, latestSequence: "1" },
        });
        const replayed = await asOwner.post(`/v0/documents/${documentId}/applyUpdates`, firstBatch);
        expect(replayed.statusCode).toBe(200);
        expect(replayed.json()).toMatchObject({ acceptedSequence: "1", replayed: true });
        expect((await asOwner.get(`/v0/documents/${documentId}`)).json().document.latestSequence).toBe(
            "1",
        );

        const partnerHint = await partnerFrames.until((frame) => frame.name === "document.updated");
        expect(partnerHint.data).toMatchObject({ chatId, documentId, sequence: "1" });

        const partnerDoc = new Y.Doc();
        const snapshot = await asPartner.get(`/v0/documents/${documentId}`);
        Y.applyUpdate(partnerDoc, decode(snapshot.json().snapshot.update as string));
        expect(partnerDoc.getText("content").toString()).toBe("Hello from the owner. ");
        const beforePartner = Y.encodeStateVector(partnerDoc);
        partnerDoc.getText("content").insert(partnerDoc.getText("content").length, "And the partner.");
        const second = await asPartner.post(`/v0/documents/${documentId}/applyUpdates`, {
            clientUpdateId: "partner-batch-1",
            updates: [encode(Y.encodeStateAsUpdate(partnerDoc, beforePartner))],
        });
        expect(second.statusCode).toBe(201);
        expect(second.json().acceptedSequence).toBe("2");

        const ownerDifference = await asOwner.post(`/v0/documents/${documentId}/getDifference`, {
            afterSequence: "1",
        });
        expect(ownerDifference.statusCode).toBe(200);
        expect(ownerDifference.json()).toMatchObject({
            latestSequence: "2",
            hasMore: false,
        });
        expect(ownerDifference.json().snapshot).toBeUndefined();
        expect(ownerDifference.json().updates).toHaveLength(1);
        for (const entry of ownerDifference.json().updates) Y.applyUpdate(ownerDoc, decode(entry.update));
        expect(ownerDoc.getText("content").toString()).toBe(
            "Hello from the owner. And the partner.",
        );

        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/getDifference`, {
                    afterSequence: "99",
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/applyUpdates`, {
                    clientUpdateId: "owner-bad-1",
                    updates: ["not base64!!"],
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asOutsider.post(`/v0/documents/${documentId}/applyUpdates`, {
                    clientUpdateId: "outsider-batch-1",
                    updates: [encode(Y.encodeStateAsUpdate(new Y.Doc()))],
                })
            ).statusCode,
        ).toBe(404);

        // The outsider stream must never have carried a document hint for this private
        // chat. A sentinel sync event proves the stream itself stayed live to the end.
        const sentinel = await asOutsider.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Outsider sentinel",
            slug: "outsider-sentinel",
        });
        expect(sentinel.statusCode).toBe(201);
        const observed: string[] = [];
        await outsiderFrames.until((frame) => {
            observed.push(frame.name);
            return frame.name === "sync";
        });
        expect(observed.filter((name) => name.startsWith("document."))).toEqual([]);

        partnerStream.abort();
        outsiderStream.abort();
        await partnerFrames.cancel();
        await outsiderFrames.cancel();
    });
});

function encode(update: Uint8Array): string {
    return Buffer.from(update).toString("base64");
}

function decode(update: string): Uint8Array {
    return new Uint8Array(Buffer.from(update, "base64"));
}

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
            if (result.done) throw new Error("Document SSE stream ended before the expected frame");
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
                    () => reject(new Error("Timed out waiting for a document SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
