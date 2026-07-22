import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("thread removal and child channel replacement", () => {
    it("removes thread routes and projections while retaining first-class child channels", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "threadless_owner" });
        const member = await server.createUser({ username: "threadless_member" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        const parent = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Parent channel",
            slug: "threadless-parent",
        });
        expect(parent.statusCode).toBe(201);
        const parentChatId = parent.json().chat.id as string;
        const sent = await asOwner.post(`/v0/chats/${parentChatId}/sendMessage`, {
            text: "Use a child channel for focused work",
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;
        expect(sent.json().message).not.toHaveProperty("threadChatId");
        expect(sent.json().message).not.toHaveProperty("threadReplyCount");
        expect(parent.json().chat).not.toHaveProperty("parentMessageId");
        expect(parent.json().chat).not.toHaveProperty("followed");
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/addMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);

        expect((await asOwner.get("/v0/threads")).statusCode).toBe(404);
        expect((await asOwner.get(`/v0/messages/${messageId}/thread`)).statusCode).toBe(404);
        expect((await asOwner.post(`/v0/messages/${messageId}/createThread`, {})).statusCode).toBe(
            404,
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/updateThreadFollow`, {
                    followed: true,
                })
            ).statusCode,
        ).toBe(404);

        const child = await asOwner.post(`/v0/chats/${parentChatId}/createChildChannel`, {
            name: "Focused work",
            slug: "focused-work",
        });
        expect(child.statusCode).toBe(201);
        expect(child.json().chat).toMatchObject({
            kind: "private_channel",
            name: "Focused work",
            parentChatId,
        });
        expect(child.json().chat).not.toHaveProperty("parentMessageId");
        expect(child.json().chat).not.toHaveProperty("followed");
        expect(
            (await asMember.post(`/v0/chats/${child.json().chat.id as string}/join`)).statusCode,
        ).toBe(200);

        const childMessage = await asOwner.post(
            `/v0/chats/${child.json().chat.id as string}/sendMessage`,
            { text: "Child channels have ordinary channel unread state" },
        );
        expect(childMessage.statusCode).toBe(201);
        expect(
            (await asMember.get(`/v0/chats/${child.json().chat.id as string}`)).json().chat,
        ).toMatchObject({ unreadCount: 1, mentionCount: 0 });

        const preferences = await asOwner.get("/v0/me/notificationPreferences");
        expect(preferences.statusCode).toBe(200);
        expect(preferences.json().preferences).not.toHaveProperty("threadReplies");
        expect(
            (
                await asOwner.post("/v0/me/updateNotificationPreferences", {
                    threadReplies: "mentions",
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/updateNotificationPreferences`, {
                    notifyThreadReplies: false,
                })
            ).statusCode,
        ).toBe(400);
    });
});
