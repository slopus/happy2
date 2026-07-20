import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("channel membership document visibility hints", () => {
    it("hints the added user about documents without adding the area for an existing member", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "document_hint_owner" });
        const existingMember = await server.createUser({
            username: "document_hint_existing_member",
        });
        const addedMember = await server.createUser({ username: "document_hint_added_member" });
        const asOwner = server.as(owner);
        const asExistingMember = server.as(existingMember);
        const asAddedMember = server.as(addedMember);

        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Membership document hints",
            slug: "membership-document-hints",
        });
        const chatId = channel.json().chat.id as string;
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/addMember`, {
                    userId: existingMember.id,
                })
            ).statusCode,
        ).toBe(200);
        const created = await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Visible after membership",
        });
        expect(created.statusCode).toBe(201);
        const documentId = created.json().document.id as string;
        expect((await asAddedMember.get("/v0/documents")).json()).toEqual({ documents: [] });

        const addedState = (await asAddedMember.get("/v0/sync/state")).json().state;
        const existingState = (await asExistingMember.get("/v0/sync/state")).json().state;

        const added = await asOwner.post(`/v0/chats/${chatId}/addMember`, {
            userId: addedMember.id,
        });
        expect(added.statusCode).toBe(200);
        expect(added.json().sync.areas).toEqual([]);

        const addedDifference = await asAddedMember.post("/v0/sync/getDifference", {
            state: addedState,
        });
        expect(addedDifference.statusCode).toBe(200);
        expect(addedDifference.json().areas).toContain("documents");
        const existingDifference = await asExistingMember.post("/v0/sync/getDifference", {
            state: existingState,
        });
        expect(existingDifference.statusCode).toBe(200);
        expect(existingDifference.json().areas).not.toContain("documents");
        expect(
            (await asAddedMember.get("/v0/documents"))
                .json()
                .documents.map((document: { id: string }) => document.id),
        ).toContain(documentId);
    });

    it("hints removed, joining, and leaving users only when an affected channel has documents", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "document_lifecycle_owner" });
        const member = await server.createUser({ username: "document_lifecycle_member" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);

        const privateChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Private document lifecycle",
            slug: "private-document-lifecycle",
        });
        const privateChatId = privateChannel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${privateChatId}/createDocument`, {
            title: "Removed with membership",
        });
        await asOwner.post(`/v0/chats/${privateChatId}/addMember`, { userId: member.id });
        const beforeRemoval = (await asMember.get("/v0/sync/state")).json().state;
        expect(
            (
                await asOwner.post(`/v0/chats/${privateChatId}/removeMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        const removalDifference = await asMember.post("/v0/sync/getDifference", {
            state: beforeRemoval,
        });
        expect(removalDifference.json().areas).toContain("documents");

        const publicChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Public document lifecycle",
            slug: "public-document-lifecycle",
        });
        const publicChatId = publicChannel.json().chat.id as string;
        await asOwner.post(`/v0/chats/${publicChatId}/createDocument`, {
            title: "Joined and left with membership",
        });
        const beforeJoin = (await asMember.get("/v0/sync/state")).json().state;
        expect((await asMember.post(`/v0/chats/${publicChatId}/join`)).statusCode).toBe(200);
        const joinDifference = await asMember.post("/v0/sync/getDifference", {
            state: beforeJoin,
        });
        expect(joinDifference.json().areas).toContain("documents");

        const beforeLeave = (await asMember.get("/v0/sync/state")).json().state;
        expect((await asMember.post(`/v0/chats/${publicChatId}/leave`)).statusCode).toBe(200);
        const leaveDifference = await asMember.post("/v0/sync/getDifference", {
            state: beforeLeave,
        });
        expect(leaveDifference.json().areas).toContain("documents");

        const emptyChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Empty membership lifecycle",
            slug: "empty-membership-lifecycle",
        });
        const emptyChatId = emptyChannel.json().chat.id as string;
        const beforeEmptyAdd = (await asMember.get("/v0/sync/state")).json().state;
        expect(
            (
                await asOwner.post(`/v0/chats/${emptyChatId}/addMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        const emptyDifference = await asMember.post("/v0/sync/getDifference", {
            state: beforeEmptyAdd,
        });
        expect(emptyDifference.json().areas).not.toContain("documents");
    });
});
