import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGymServer } from "../../sources/index.js";

describe("channel documents lifecycle", () => {
    it("creates, lists, renames, and deletes documents inside one channel with documents-area sync hints", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "doc_owner", firstName: "Owner" });
        const collaborator = await server.createUser({
            username: "doc_collaborator",
            firstName: "Collaborator",
        });
        const outsider = await server.createUser({
            username: "doc_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const asCollaborator = server.as(collaborator);
        const asOutsider = server.as(outsider);
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Documents home",
            slug: "documents-home",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: collaborator.id }))
                .statusCode,
        ).toBe(200);
        const ownerBaseline = (await asOwner.get("/v0/sync/state")).json().state;

        const created = await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Design notes",
        });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({
            document: {
                title: "Design notes",
                format: "blocknote",
                ownerUserId: owner.id,
                channelAttachments: [{ chatId, attachedByUserId: owner.id }],
                latestSequence: "0",
            },
            sync: { areas: ["documents"], chats: [] },
        });
        const documentId = created.json().document.id as string;

        const seeded = new Y.Doc();
        seeded.getText("content").insert(0, "Seeded from creation");
        const seededWith = await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Seeded",
            initialUpdate: Buffer.from(Y.encodeStateAsUpdate(seeded)).toString("base64"),
        });
        expect(seededWith.statusCode).toBe(201);
        expect(seededWith.json().document.latestSequence).toBe("1");
        const seededId = seededWith.json().document.id as string;
        const seededSnapshot = await asCollaborator.get(`/v0/documents/${seededId}`);
        expect(seededSnapshot.statusCode).toBe(200);
        const seededCopy = new Y.Doc();
        Y.applyUpdate(
            seededCopy,
            new Uint8Array(Buffer.from(seededSnapshot.json().snapshot.update as string, "base64")),
        );
        expect(seededCopy.getText("content").toString()).toBe("Seeded from creation");

        const listed = await asCollaborator.get(`/v0/chats/${chatId}/documents`);
        expect(listed.statusCode).toBe(200);
        expect(listed.json().documents.map((entry: { id: string }) => entry.id)).toEqual(
            expect.arrayContaining([documentId, seededId]),
        );
        expect(listed.json().documents).toHaveLength(2);

        expect((await asOutsider.get(`/v0/chats/${chatId}/documents`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);
        expect(
            (await asOutsider.post(`/v0/documents/${documentId}/rename`, { title: "Taken over" }))
                .statusCode,
        ).toBe(404);

        const renamed = await asCollaborator.post(`/v0/documents/${documentId}/rename`, {
            title: "Design notes v2",
        });
        expect(renamed.statusCode).toBe(200);
        expect(renamed.json()).toMatchObject({
            document: { id: documentId, title: "Design notes v2" },
            sync: { areas: ["documents"], chats: [] },
        });

        expect(
            (await asCollaborator.post(`/v0/documents/${documentId}/delete`, {})).statusCode,
        ).toBe(404);

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
                    title: "x".repeat(201),
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
                    title: "Bad format",
                    format: "lexical",
                })
            ).statusCode,
        ).toBe(400);

        const difference = await asOwner.post("/v0/sync/getDifference", {
            state: ownerBaseline,
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().areas).toContain("documents");

        const deleted = await asOwner.post(`/v0/documents/${seededId}/delete`, {});
        expect(deleted.statusCode).toBe(200);
        expect(deleted.json().sync.areas).toEqual(["documents"]);
        expect((await asOwner.get(`/v0/documents/${seededId}`)).statusCode).toBe(404);
        const afterDelete = await asOwner.get(`/v0/chats/${chatId}/documents`);
        expect(afterDelete.json().documents).toHaveLength(1);
        expect(afterDelete.json().documents[0]).toMatchObject({
            id: documentId,
            title: "Design notes v2",
        });

        await server.restart();
        const persisted = await asCollaborator.get(`/v0/chats/${chatId}/documents`);
        expect(persisted.statusCode).toBe(200);
        expect(persisted.json().documents).toHaveLength(1);
        expect(persisted.json().documents[0]).toMatchObject({ title: "Design notes v2" });
    });
});
