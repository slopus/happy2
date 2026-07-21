import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("voluntary private-channel departure and explicit membership revocation", () => {
    it("preserves history and rejoin for every voluntary departure while a removal revokes both", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "recovering_owner" });
        const channelAdmin = await server.createUser({ username: "recovering_channel_admin" });
        const member = await server.createUser({ username: "recovering_member" });
        const archivedMember = await server.createUser({ username: "archived_member" });
        const outsider = await server.createUser({ username: "private_outsider" });
        const asOwner = server.as(owner);
        const asChannelAdmin = server.as(channelAdmin);
        const asMember = server.as(member);
        const asArchivedMember = server.as(archivedMember);
        const asOutsider = server.as(outsider);

        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Recoverable private channel",
            slug: "recoverable-private-channel",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/addMember`, {
                    userId: channelAdmin.id,
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: archivedMember.id }))
                .statusCode,
        ).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Private history remains recoverable after leaving",
                })
            ).statusCode,
        ).toBe(201);

        const leaveBaseline = (await asMember.get("/v0/sync/state")).json().state;
        expect((await asMember.post(`/v0/chats/${chatId}/leave`)).statusCode).toBe(200);
        const readable = await asMember.get(`/v0/chats/${chatId}`);
        expect(readable.statusCode).toBe(200);
        expect(readable.json().chat.membershipRole).toBeUndefined();
        expect(
            (await asMember.post(`/v0/chats/${chatId}/sendMessage`, { text: "blocked" }))
                .statusCode,
        ).toBe(404);
        expect(
            (await asMember.get(`/v0/chats/${chatId}/messages`))
                .json()
                .messages.map((message: { text: string }) => message.text),
        ).toContain("Private history remains recoverable after leaving");
        expect(
            (await asMember.get("/v0/directory/channels"))
                .json()
                .channels.map((channel: { id: string }) => channel.id),
        ).toContain(chatId);
        expect(
            (await asMember.get("/v0/search?q=recoverable%20after%20leaving"))
                .json()
                .results.some((result: { type: string }) => result.type === "message"),
        ).toBe(true);
        const leaveDifference = await asMember.post("/v0/sync/getDifference", {
            state: leaveBaseline,
        });
        expect(leaveDifference.statusCode).toBe(200);
        expect(leaveDifference.json().removedChatIds).toContain(chatId);
        expect(
            leaveDifference.json().changedChats.find((chat: { id: string }) => chat.id === chatId),
        ).toBeUndefined();
        expect(
            (await asOutsider.get("/v0/directory/channels"))
                .json()
                .channels.map((channel: { id: string }) => channel.id),
        ).not.toContain(chatId);
        expect((await asOutsider.get(`/v0/chats/${chatId}`)).statusCode).toBe(404);
        expect(
            (await asOutsider.get("/v0/search?q=recoverable%20after%20leaving"))
                .json()
                .results.some((result: { type: string }) => result.type === "message"),
        ).toBe(false);

        const memberRejoined = await asMember.post(`/v0/chats/${chatId}/join`);
        expect(memberRejoined.statusCode).toBe(200);
        expect(memberRejoined.json().chat.membershipRole).toBe("member");
        expect((await asChannelAdmin.post(`/v0/chats/${chatId}/leave`)).statusCode).toBe(200);
        const adminRejoined = await asChannelAdmin.post(`/v0/chats/${chatId}/join`);
        expect(adminRejoined.statusCode).toBe(200);
        expect(adminRejoined.json().chat.membershipRole).toBe("admin");
        expect((await asOwner.post(`/v0/chats/${chatId}/leave`)).statusCode).toBe(200);
        expect((await asOwner.get(`/v0/chats/${chatId}`)).statusCode).toBe(200);
        const ownerRejoined = await asOwner.post(`/v0/chats/${chatId}/join`);
        expect(ownerRejoined.statusCode).toBe(200);
        expect(ownerRejoined.json().chat.membershipRole).toBe("owner");

        expect((await asMember.post(`/v0/chats/${chatId}/leave`)).statusCode).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asMember.get(`/v0/chats/${chatId}`)).statusCode).toBe(404);
        expect((await asMember.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(404);

        const archiveOnly = await asOwner.post(`/v0/chats/${chatId}/archiveChannel`);
        expect(archiveOnly.statusCode).toBe(200);
        expect(archiveOnly.json().chat.membershipRole).toBe("owner");
        expect(
            (await asOwner.get(`/v0/chats/${chatId}/members`))
                .json()
                .memberships.map((membership: { user: { id: string } }) => membership.user.id),
        ).toEqual(expect.arrayContaining([owner.id, channelAdmin.id, archivedMember.id]));
        const activeOwnerUnarchived = await asOwner.post(`/v0/chats/${chatId}/unarchiveChannel`, {
            join: true,
        });
        expect(activeOwnerUnarchived.statusCode).toBe(200);
        expect(activeOwnerUnarchived.json().chat.membershipRole).toBe("owner");

        const memberBaseline = (await asArchivedMember.get("/v0/sync/state")).json().state;
        const archived = await asOwner.post(`/v0/chats/${chatId}/archiveChannel`, {
            leave: true,
        });
        expect(archived.statusCode).toBe(200);
        expect(archived.json().chat.archivedAt).toEqual(expect.any(String));
        expect(archived.json().chat.membershipRole).toBeUndefined();
        expect((await asOwner.get(`/v0/chats/${chatId}/members`)).json().memberships).toEqual([]);
        expect((await asChannelAdmin.get(`/v0/chats/${chatId}/messages`)).statusCode).toBe(200);
        expect((await asArchivedMember.get(`/v0/chats/${chatId}/messages`)).statusCode).toBe(200);
        expect((await asChannelAdmin.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(409);
        expect((await asArchivedMember.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(409);
        const memberDifference = await asArchivedMember.post("/v0/sync/getDifference", {
            state: memberBaseline,
        });
        expect(memberDifference.statusCode).toBe(200);
        expect(memberDifference.json().removedChatIds).toContain(chatId);
        expect(
            memberDifference.json().changedChats.find((chat: { id: string }) => chat.id === chatId),
        ).toBeUndefined();

        await server.restart();
        expect((await asOwner.get(`/v0/chats/${chatId}/members`)).json().memberships).toEqual([]);
        expect((await asChannelAdmin.get(`/v0/chats/${chatId}/messages`)).statusCode).toBe(200);
        expect((await asArchivedMember.get(`/v0/chats/${chatId}/messages`)).statusCode).toBe(200);

        expect((await asChannelAdmin.post(`/v0/chats/${chatId}/unarchiveChannel`)).statusCode).toBe(
            200,
        );
        expect((await asOwner.get(`/v0/chats/${chatId}/members`)).json().memberships).toEqual([]);
        expect((await asChannelAdmin.post(`/v0/chats/${chatId}/archiveChannel`)).statusCode).toBe(
            200,
        );
        const joinedAgain = await asChannelAdmin.post(`/v0/chats/${chatId}/unarchiveChannel`, {
            join: true,
        });
        expect(joinedAgain.statusCode).toBe(200);
        expect(joinedAgain.json().chat.membershipRole).toBe("admin");
        const archivedMemberRejoined = await asArchivedMember.post(`/v0/chats/${chatId}/join`);
        expect(archivedMemberRejoined.statusCode).toBe(200);
        expect(archivedMemberRejoined.json().chat.membershipRole).toBe("member");
        expect((await asOwner.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(200);
    });

    it("rolls back unarchive when an explicitly removed server admin also requests to join", async () => {
        await using server = await createGymServer();
        const serverAdmin = await server.createUser({ username: "removed_server_admin" });
        const channelOwner = await server.createUser({ username: "replacement_channel_owner" });
        const asServerAdmin = server.as(serverAdmin);
        const asChannelOwner = server.as(channelOwner);

        const created = await asServerAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Removed server admin channel",
            slug: "removed-server-admin-channel",
        });
        const chatId = created.json().chat.id as string;
        expect(
            (
                await asServerAdmin.post(`/v0/chats/${chatId}/addMember`, {
                    userId: channelOwner.id,
                    role: "owner",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asChannelOwner.post(`/v0/chats/${chatId}/setMemberRole`, {
                    userId: serverAdmin.id,
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asChannelOwner.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: serverAdmin.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asChannelOwner.post(`/v0/chats/${chatId}/archiveChannel`)).statusCode).toBe(
            200,
        );

        expect(
            (
                await asServerAdmin.post(`/v0/chats/${chatId}/unarchiveChannel`, {
                    join: true,
                })
            ).statusCode,
        ).toBe(404);
        expect((await asChannelOwner.get(`/v0/chats/${chatId}`)).json().chat.archivedAt).toEqual(
            expect.any(String),
        );
    });
});
