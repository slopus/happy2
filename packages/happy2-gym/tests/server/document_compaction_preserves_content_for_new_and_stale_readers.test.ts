import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGymServer } from "../../sources/index.js";

describe("collaborative document compaction", () => {
    it("folds the update log into the snapshot while stale cursors and fresh readers stay lossless", async () => {
        await using server = await createGymServer();
        const author = await server.createUser({ username: "compact_author", firstName: "Author" });
        const asAuthor = server.as(author);
        const channel = await asAuthor.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Compaction lab",
            slug: "compaction-lab",
        });
        const chatId = channel.json().chat.id as string;
        const created = await asAuthor.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Long lived page",
        });
        const documentId = created.json().document.id as string;

        const doc = new Y.Doc();
        const text = doc.getText("content");
        const batches = 70;
        for (let index = 1; index <= batches; index += 1) {
            const before = Y.encodeStateVector(doc);
            text.insert(text.length, `word${index} `);
            const response = await asAuthor.post(`/v0/documents/${documentId}/applyUpdates`, {
                clientUpdateId: `author-batch-${index}`,
                updates: [Buffer.from(Y.encodeStateAsUpdate(doc, before)).toString("base64")],
            });
            expect(response.statusCode).toBe(201);
            expect(response.json().acceptedSequence).toBe(String(index));
        }
        const expected = text.toString();

        // A cursor from before the compaction floor falls back to the snapshot.
        const stale = await asAuthor.post(`/v0/documents/${documentId}/getDifference`, {
            afterSequence: "0",
        });
        expect(stale.statusCode).toBe(200);
        expect(stale.json().snapshot).toBeDefined();
        expect(Number(stale.json().snapshot.sequence)).toBeGreaterThanOrEqual(64);
        expect(stale.json().latestSequence).toBe(String(batches));
        const staleDoc = new Y.Doc();
        Y.applyUpdate(staleDoc, decode(stale.json().snapshot.update as string));
        for (const entry of stale.json().updates) Y.applyUpdate(staleDoc, decode(entry.update));
        expect(stale.json().hasMore).toBe(false);
        expect(staleDoc.getText("content").toString()).toBe(expected);

        // A fresh reader hydrates from one merged snapshot.
        const fresh = await asAuthor.get(`/v0/documents/${documentId}`);
        expect(fresh.statusCode).toBe(200);
        expect(fresh.json().snapshot.sequence).toBe(String(batches));
        const freshDoc = new Y.Doc();
        Y.applyUpdate(freshDoc, decode(fresh.json().snapshot.update as string));
        expect(freshDoc.getText("content").toString()).toBe(expected);

        // A bounded slice pages a mid-log cursor forward without skipping updates.
        const pagedDoc = new Y.Doc();
        const midpoint = await asAuthor.post(`/v0/documents/${documentId}/getDifference`, {
            afterSequence: "0",
            limit: 1,
        });
        Y.applyUpdate(pagedDoc, decode(midpoint.json().snapshot.update as string));
        let cursor = midpoint.json().snapshot.sequence as string;
        let hasMore = true;
        while (hasMore) {
            const page = await asAuthor.post(`/v0/documents/${documentId}/getDifference`, {
                afterSequence: cursor,
                limit: 1,
            });
            expect(page.statusCode).toBe(200);
            expect(page.json().snapshot).toBeUndefined();
            for (const entry of page.json().updates) {
                Y.applyUpdate(pagedDoc, decode(entry.update));
                cursor = entry.sequence;
            }
            hasMore = page.json().hasMore;
        }
        expect(cursor).toBe(String(batches));
        expect(pagedDoc.getText("content").toString()).toBe(expected);

        // Replay detection survives compaction inside the retention window.
        const replay = await asAuthor.post(`/v0/documents/${documentId}/applyUpdates`, {
            clientUpdateId: "author-batch-70",
            updates: [Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())).toString("base64")],
        });
        expect(replay.statusCode).toBe(200);
        expect(replay.json()).toMatchObject({ acceptedSequence: "70", replayed: true });

        await server.restart();
        const persisted = await asAuthor.get(`/v0/documents/${documentId}`);
        const persistedDoc = new Y.Doc();
        Y.applyUpdate(persistedDoc, decode(persisted.json().snapshot.update as string));
        expect(persistedDoc.getText("content").toString()).toBe(expected);
    });
});

function decode(update: string): Uint8Array {
    return new Uint8Array(Buffer.from(update, "base64"));
}
