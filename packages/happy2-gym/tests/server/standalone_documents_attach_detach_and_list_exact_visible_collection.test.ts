import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("standalone document collection and channel attachments", () => {
    it("creates unattached documents, attaches and detaches without deletion, and lists exactly the visible set", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "files_owner", firstName: "Owner" });
        const firstMember = await server.createUser({
            username: "files_first_member",
            firstName: "First",
        });
        const secondMember = await server.createUser({
            username: "files_second_member",
            firstName: "Second",
        });
        const outsider = await server.createUser({
            username: "files_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const asFirstMember = server.as(firstMember);
        const asSecondMember = server.as(secondMember);
        const asOutsider = server.as(outsider);

        const firstChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "First document channel",
            slug: "first-document-channel",
        });
        const firstChatId = firstChannel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${firstChatId}/addMember`, { userId: firstMember.id });
        const secondChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Second document channel",
            slug: "second-document-channel",
        });
        const secondChatId = secondChannel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${secondChatId}/addMember`, { userId: secondMember.id });

        const standalone = await asOwner.post("/v0/documents/create", {
            title: "Portable design",
            format: "blocknote",
        });
        expect(standalone.statusCode).toBe(201);
        expect(standalone.json()).toMatchObject({
            document: {
                ownerUserId: owner.id,
                title: "Portable design",
                format: "blocknote",
                channelAttachments: [],
                latestSequence: "0",
            },
            sync: { areas: ["documents"], chats: [] },
        });
        const documentId = standalone.json().document.id as string;
        expect((await asFirstMember.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);

        const firstAttachment = await asOwner.post(`/v0/documents/${documentId}/attach`, {
            chatId: firstChatId,
        });
        expect(firstAttachment.statusCode).toBe(201);
        expect(firstAttachment.json()).toMatchObject({
            attachment: { chatId: firstChatId, attachedByUserId: owner.id },
            document: {
                id: documentId,
                channelAttachments: [{ chatId: firstChatId, attachedByUserId: owner.id }],
            },
            sync: { areas: ["documents"], chats: [] },
        });
        expect((await asFirstMember.get(`/v0/documents/${documentId}`)).statusCode).toBe(200);
        expect((await asSecondMember.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);

        const secondAttachment = await asOwner.post(`/v0/documents/${documentId}/attach`, {
            chatId: secondChatId,
        });
        expect(secondAttachment.statusCode).toBe(201);
        expect(
            secondAttachment
                .json()
                .document.channelAttachments.map(
                    (attachment: { chatId: string }) => attachment.chatId,
                ),
        ).toEqual(expect.arrayContaining([firstChatId, secondChatId]));
        expect(secondAttachment.json().document.channelAttachments).toHaveLength(2);
        expect((await asSecondMember.get(`/v0/documents/${documentId}`)).statusCode).toBe(200);
        expect(
            (await asFirstMember.get(`/v0/documents/${documentId}`)).json().document
                .channelAttachments,
        ).toMatchObject([{ chatId: firstChatId }]);

        const channelOwned = await asOwner.post(`/v0/chats/${firstChatId}/createDocument`, {
            title: "First channel notes",
        });
        const channelOwnedId = channelOwned.json().document.id as string;
        const publicChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Public but membership-gated documents",
            slug: "public-membership-gated-documents",
        });
        const publicChatId = publicChannel.json().chat.id as string;
        const publicDocument = await asOwner.post(`/v0/chats/${publicChatId}/createDocument`, {
            title: "Members only despite public channel",
        });
        const publicDocumentId = publicDocument.json().document.id as string;
        expect((await asOutsider.get(`/v0/documents/${publicDocumentId}`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/chats/${publicChatId}/documents`)).statusCode).toBe(404);
        const memberStandalone = await asFirstMember.post("/v0/documents/create", {
            title: "First member private",
        });
        const memberStandaloneId = memberStandalone.json().document.id as string;

        const ownerDocuments = (await asOwner.get("/v0/documents")).json().documents as Array<{
            id: string;
            updatedAt: string;
        }>;
        expect(new Set(ownerDocuments.map((document) => document.id))).toEqual(
            new Set([documentId, channelOwnedId, publicDocumentId]),
        );
        expect(ownerDocuments).toEqual(
            [...ownerDocuments].sort(
                (left, right) =>
                    right.updatedAt.localeCompare(left.updatedAt) ||
                    right.id.localeCompare(left.id),
            ),
        );

        const firstMemberDocuments = (await asFirstMember.get("/v0/documents")).json()
            .documents as Array<{ id: string; channelAttachments: Array<{ chatId: string }> }>;
        expect(new Set(firstMemberDocuments.map((document) => document.id))).toEqual(
            new Set([documentId, channelOwnedId, memberStandaloneId]),
        );
        expect(
            firstMemberDocuments.find((document) => document.id === documentId)?.channelAttachments,
        ).toMatchObject([{ chatId: firstChatId }]);
        expect(
            (await asSecondMember.get("/v0/documents"))
                .json()
                .documents.map((document: { id: string }) => document.id),
        ).toEqual([documentId]);
        expect((await asOutsider.get("/v0/documents")).json()).toEqual({ documents: [] });

        const detached = await asOwner.post(`/v0/documents/${documentId}/detach`, {
            chatId: firstChatId,
        });
        expect(detached.statusCode).toBe(200);
        expect(detached.json()).toMatchObject({
            documentId,
            chatId: firstChatId,
            sync: { areas: ["documents"], chats: [] },
        });
        expect((await asFirstMember.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);
        expect(
            (await asOwner.get(`/v0/documents/${documentId}`)).json().document.channelAttachments,
        ).toMatchObject([{ chatId: secondChatId }]);
        expect(
            (await asOwner.get(`/v0/chats/${firstChatId}/documents`))
                .json()
                .documents.map((document: { id: string }) => document.id),
        ).toEqual([channelOwnedId]);

        expect(
            (
                await asOutsider.post(`/v0/documents/${documentId}/detach`, {
                    chatId: secondChatId,
                })
            ).statusCode,
        ).toBe(404);
        const detachedLastAttachment = await asOwner.post(`/v0/documents/${documentId}/detach`, {
            chatId: secondChatId,
        });
        expect(detachedLastAttachment.statusCode).toBe(200);
        const stillOwned = await asOwner.get(`/v0/documents/${documentId}`);
        expect(stillOwned.statusCode).toBe(200);
        expect(stillOwned.json().document.channelAttachments).toEqual([]);
        expect((await asSecondMember.get(`/v0/documents/${documentId}`)).statusCode).toBe(404);
        expect((await asOwner.get(`/v0/chats/${secondChatId}/documents`)).json().documents).toEqual(
            [],
        );
    });
});
