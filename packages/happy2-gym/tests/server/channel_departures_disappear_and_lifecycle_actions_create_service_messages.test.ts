import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("channel sidebar departures and lifecycle service messages", () => {
    it("removes a departed channel from sync and fresh lists while recording join, leave, kick, and archive notices", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "lifecycle_owner" });
        const member = await server.createUser({ username: "lifecycle_member" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);

        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Lifecycle notices",
            slug: "lifecycle-notices",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;

        const beforeJoin = (await asMember.get("/v0/sync/state")).json().state;
        expect((await asMember.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(200);
        expect(await lifecycleService(asOwner, chatId, "user_joined")).toMatchObject({
            userId: member.id,
            text: "@lifecycle_member joined #lifecycle-notices",
        });
        expect(
            (
                await asMember.post("/v0/sync/getDifference", {
                    state: beforeJoin,
                })
            )
                .json()
                .changedChats.map((chat: { id: string }) => chat.id),
        ).toContain(chatId);

        const beforeLeave = (await asMember.get("/v0/sync/state")).json().state;
        expect((await asMember.post(`/v0/chats/${chatId}/leave`)).statusCode).toBe(200);
        expect(await lifecycleService(asOwner, chatId, "user_left")).toMatchObject({
            userId: member.id,
            text: "@lifecycle_member left #lifecycle-notices",
        });
        const leaveDifference = await asMember.post("/v0/sync/getDifference", {
            state: beforeLeave,
        });
        expect(leaveDifference.statusCode).toBe(200);
        expect(leaveDifference.json().removedChatIds).toContain(chatId);
        expect(
            (await asMember.get("/v0/chats")).json().chats.map((chat: { id: string }) => chat.id),
        ).not.toContain(chatId);
        expect(
            (await asMember.get("/v0/directory/channels"))
                .json()
                .channels.map((chat: { id: string }) => chat.id),
        ).toContain(chatId);

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "A later message must not restore a departed sidebar row",
                })
            ).statusCode,
        ).toBe(201);
        const afterLaterMessage = await asMember.post("/v0/sync/getDifference", {
            state: leaveDifference.json().state,
        });
        expect(afterLaterMessage.json().removedChatIds).not.toContain(chatId);
        expect(
            afterLaterMessage.json().changedChats.map((chat: { id: string }) => chat.id),
        ).not.toContain(chatId);

        expect((await asMember.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(200);
        const leaveThenJoinDifference = await asMember.post("/v0/sync/getDifference", {
            state: beforeLeave,
        });
        expect(leaveThenJoinDifference.json().removedChatIds).not.toContain(chatId);
        expect(
            leaveThenJoinDifference.json().changedChats.map((chat: { id: string }) => chat.id),
        ).toContain(chatId);
        expect(
            (await asMember.get("/v0/chats")).json().chats.map((chat: { id: string }) => chat.id),
        ).toContain(chatId);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        expect(await lifecycleService(asOwner, chatId, "user_kicked")).toMatchObject({
            userId: member.id,
            text: "@lifecycle_member was removed from #lifecycle-notices",
        });

        expect((await asOwner.post(`/v0/chats/${chatId}/archiveChannel`)).statusCode).toBe(200);
        expect(await lifecycleService(asOwner, chatId, "channel_archived")).toMatchObject({
            userId: owner.id,
            text: "@lifecycle_owner archived #lifecycle-notices",
        });
    });

    it("announces an archive once without reporting every deactivated member as leaving", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "archive_owner" });
        const member = await server.createUser({ username: "archive_member" });
        const asOwner = server.as(owner);

        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Quiet archive",
            slug: "quiet-archive",
        });
        const chatId = created.json().chat.id as string;
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/addMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/archiveChannel`, {
                    leave: true,
                })
            ).statusCode,
        ).toBe(200);
        const services = await lifecycleServices(asOwner, chatId);
        expect(services.filter((service) => service.type === "channel_archived")).toEqual([
            expect.objectContaining({
                userId: owner.id,
                text: "@archive_owner archived #quiet-archive",
            }),
        ]);
        expect(services.filter((service) => service.type === "user_left")).toEqual([]);
    });
});

type LifecycleServiceType = "user_joined" | "user_left" | "user_kicked" | "channel_archived";

async function lifecycleService(
    client: GymRequestClient,
    chatId: string,
    type: LifecycleServiceType,
): Promise<{ type: string; userId: string; text: string } | undefined> {
    return (await lifecycleServices(client, chatId)).find((service) => service.type === type);
}

async function lifecycleServices(
    client: GymRequestClient,
    chatId: string,
): Promise<Array<{ type: string; userId: string; text: string }>> {
    const response = await client.get(`/v0/chats/${chatId}/messages`);
    expect(response.statusCode).toBe(200);
    return response
        .json()
        .messages.flatMap((message: { text: string; service?: { type: string; userId: string } }) =>
            message.service ? [{ ...message.service, text: message.text }] : [],
        );
}
