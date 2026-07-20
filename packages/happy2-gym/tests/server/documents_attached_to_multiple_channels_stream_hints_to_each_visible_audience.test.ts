import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGymServer } from "../../sources/index.js";

describe("document realtime fanout across attachments", () => {
    it("hints an unattached owner and members of both attached channels without reaching outsiders", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "fanout_owner", firstName: "Owner" });
        const firstMember = await server.createUser({
            username: "fanout_first",
            firstName: "First",
        });
        const secondMember = await server.createUser({
            username: "fanout_second",
            firstName: "Second",
        });
        const outsider = await server.createUser({
            username: "fanout_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const asOutsider = server.as(outsider);
        const firstChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Realtime first",
            slug: "realtime-first",
        });
        const firstChatId = firstChannel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${firstChatId}/addMember`, { userId: firstMember.id });
        const secondChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Realtime second",
            slug: "realtime-second",
        });
        const secondChatId = secondChannel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${secondChatId}/addMember`, { userId: secondMember.id });
        const created = await asOwner.post("/v0/documents/create", { title: "Fanout page" });
        const documentId = created.json().document.id as string;

        const baseUrl = await server.listen();
        const ownerStream = await openFrames(baseUrl, owner.token);
        const source = new Y.Doc();
        const text = source.getText("content");
        const beforeUnattached = Y.encodeStateVector(source);
        text.insert(0, "Owner-only update");
        const unattached = await asOwner.post(`/v0/documents/${documentId}/applyUpdates`, {
            clientUpdateId: "unattached-owner-update",
            updates: [encode(Y.encodeStateAsUpdate(source, beforeUnattached))],
        });
        expect(unattached.statusCode).toBe(201);
        const ownerHint = await ownerStream.frames.until(
            (frame) => frame.name === "document.updated",
        );
        expect(ownerHint.data).toMatchObject({ documentId, sequence: "1" });
        expect(ownerHint.data).not.toHaveProperty("chatId");
        ownerStream.abort.abort();
        await ownerStream.frames.cancel();

        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/attach`, {
                    chatId: firstChatId,
                })
            ).statusCode,
        ).toBe(201);
        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/attach`, {
                    chatId: secondChatId,
                })
            ).statusCode,
        ).toBe(201);

        const firstStream = await openFrames(baseUrl, firstMember.token);
        const secondStream = await openFrames(baseUrl, secondMember.token);
        const outsiderStream = await openFrames(baseUrl, outsider.token);
        const beforeAttached = Y.encodeStateVector(source);
        text.insert(text.length, " shared with both channels");
        const attached = await asOwner.post(`/v0/documents/${documentId}/applyUpdates`, {
            clientUpdateId: "attached-two-channel-update",
            updates: [encode(Y.encodeStateAsUpdate(source, beforeAttached))],
        });
        expect(attached.statusCode).toBe(201);

        const [firstHint, secondHint] = await Promise.all([
            firstStream.frames.until((frame) => frame.name === "document.updated"),
            secondStream.frames.until((frame) => frame.name === "document.updated"),
        ]);
        expect(firstHint.data).toMatchObject({
            chatId: firstChatId,
            documentId,
            sequence: "2",
        });
        expect(secondHint.data).toMatchObject({
            chatId: secondChatId,
            documentId,
            sequence: "2",
        });
        expect((await asOutsider.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);

        const sentinel = await asOutsider.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Fanout outsider sentinel",
            slug: "fanout-outsider-sentinel",
        });
        expect(sentinel.statusCode).toBe(201);
        const observed: string[] = [];
        await outsiderStream.frames.until((frame) => {
            observed.push(frame.name);
            return frame.name === "sync";
        });
        expect(observed.filter((name) => name.startsWith("document."))).toEqual([]);

        for (const stream of [firstStream, secondStream, outsiderStream]) stream.abort.abort();
        await Promise.all(
            [firstStream, secondStream, outsiderStream].map((stream) => stream.frames.cancel()),
        );
    });
});

function encode(update: Uint8Array): string {
    return Buffer.from(update).toString("base64");
}

async function openFrames(
    baseUrl: string,
    token: string,
): Promise<{ abort: AbortController; frames: SseFrames }> {
    const abort = new AbortController();
    const response = await fetch(`${baseUrl}/v0/sync/events`, {
        headers: { authorization: `Bearer ${token}` },
        signal: abort.signal,
    });
    const frames = new SseFrames(response.body!.getReader());
    expect((await frames.next()).name).toBe("ready");
    return { abort, frames };
}

class SseFrames {
    private buffer = "";

    constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

    async next(): Promise<{ name: string; data: Record<string, unknown> }> {
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
        predicate: (frame: { name: string; data: Record<string, unknown> }) => boolean,
    ): Promise<{ name: string; data: Record<string, unknown> }> {
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
