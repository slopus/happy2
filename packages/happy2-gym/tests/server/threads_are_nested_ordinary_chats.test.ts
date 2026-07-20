import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("threads are nested ordinary chats", () => {
    it("creates one child chat per message and preserves normal timelines, sync, follows, and inherited access at every depth", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "thread_tree_owner" });
        const member = await server.createUser({ username: "thread_tree_member" });
        const lateMember = await server.createUser({ username: "thread_tree_late" });
        const outsider = await server.createUser({ username: "thread_tree_outsider" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        const asLateMember = server.as(lateMember);
        const asOutsider = server.as(outsider);

        const parent = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Nested thread parent",
            slug: "nested-thread-parent",
        });
        expect(parent.statusCode).toBe(201);
        const parentChatId = parent.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${parentChatId}/addMember`, { userId: member.id }))
                .statusCode,
        ).toBe(200);
        const baseState = (await asMember.get("/v0/sync/state")).json().state;

        const root = await asOwner.post(`/v0/chats/${parentChatId}/sendMessage`, {
            text: "Root in the parent chat",
        });
        expect(root.statusCode).toBe(201);
        const rootMessageId = root.json().message.id as string;
        const concurrentCreates = await Promise.all([
            asMember.post(`/v0/messages/${rootMessageId}/createThread`, {}),
            asMember.post(`/v0/messages/${rootMessageId}/createThread`, {}),
        ]);
        expect(concurrentCreates.map((response) => response.statusCode).sort()).toEqual([200, 201]);
        const first = concurrentCreates.find((response) => response.statusCode === 201)!;
        expect(first.json().chat).toMatchObject({
            kind: "private_channel",
            parentMessageId: rootMessageId,
            followed: true,
            membershipRole: "member",
            lastMessageSequence: "0",
        });
        const firstChatId = first.json().chat.id as string;
        expect(firstChatId).not.toBe(parentChatId);

        const duplicate = await asOwner.post(`/v0/messages/${rootMessageId}/createThread`, {});
        expect(duplicate.statusCode).toBe(200);
        expect(duplicate.json().chat.id).toBe(firstChatId);
        expect((await asOwner.get(`/v0/messages/${rootMessageId}/thread`)).json().chat.id).toBe(
            firstChatId,
        );
        expect((await asOwner.get(`/v0/messages/${rootMessageId}`)).json().message).toMatchObject({
            threadChatId: firstChatId,
            threadReplyCount: 0,
        });

        const firstReply = await asMember.post(`/v0/chats/${firstChatId}/sendMessage`, {
            text: "Reply in its own ordinary chat",
        });
        expect(firstReply.statusCode).toBe(201);
        const firstReplyId = firstReply.json().message.id as string;
        expect(firstReply.json().message).toMatchObject({
            chatId: firstChatId,
            sequence: "1",
        });
        expect(firstReply.json().message.threadRootMessageId).toBeUndefined();
        expect(
            (await asOwner.get(`/v0/chats/${parentChatId}/messages`))
                .json()
                .messages.filter((message: { service?: unknown }) => !message.service)
                .map((message: { id: string }) => message.id),
        ).toEqual([rootMessageId]);
        expect(
            (await asOwner.get(`/v0/chats/${firstChatId}/messages`))
                .json()
                .messages.map((message: { id: string }) => message.id),
        ).toEqual([firstReplyId]);
        expect((await asOwner.get(`/v0/messages/${rootMessageId}`)).json().message).toMatchObject({
            threadChatId: firstChatId,
            threadReplyCount: 1,
        });
        expect(
            (await asOwner.get("/v0/notifications?unreadOnly=true")).json().notifications,
        ).toContainEqual(
            expect.objectContaining({
                kind: "thread_reply",
                chatId: firstChatId,
                messageId: firstReplyId,
            }),
        );

        const second = await asMember.post(`/v0/messages/${firstReplyId}/createThread`, {});
        expect(second.statusCode).toBe(201);
        const secondChatId = second.json().chat.id as string;
        expect(second.json().chat).toMatchObject({ parentMessageId: firstReplyId, followed: true });
        const secondReply = await asOwner.post(`/v0/chats/${secondChatId}/sendMessage`, {
            text: "A reply one level deeper",
        });
        expect(secondReply.statusCode).toBe(201);
        const secondReplyId = secondReply.json().message.id as string;
        const third = await asOwner.post(`/v0/messages/${secondReplyId}/createThread`, {});
        expect(third.statusCode).toBe(201);
        const thirdChatId = third.json().chat.id as string;
        expect(third.json().chat.parentMessageId).toBe(secondReplyId);
        expect(new Set([parentChatId, firstChatId, secondChatId, thirdChatId]).size).toBe(4);

        const followed = await asMember.get("/v0/threads?unreadOnly=false");
        expect(followed.statusCode).toBe(200);
        expect(followed.json().threads).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: firstChatId, parentMessageId: rootMessageId }),
                expect.objectContaining({ id: secondChatId, parentMessageId: firstReplyId }),
            ]),
        );
        expect(
            (
                await asMember.post(`/v0/chats/${secondChatId}/updateThreadFollow`, {
                    followed: false,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (await asMember.get("/v0/threads?unreadOnly=false"))
                .json()
                .threads.map((chat: { id: string }) => chat.id),
        ).not.toContain(secondChatId);
        const marked = await asMember.post(`/v0/chats/${secondChatId}/markRead`, {
            messageId: secondReplyId,
        });
        expect(marked.statusCode).toBe(200);
        expect(marked.json().chat).toMatchObject({ unreadCount: 0, lastReadSequence: "1" });
        const unfollowedReply = await asOwner.post(`/v0/chats/${secondChatId}/sendMessage`, {
            text: "Unfollowed ordinary thread activity stays out of unread and notifications",
        });
        expect(unfollowedReply.statusCode).toBe(201);
        expect((await asMember.get(`/v0/chats/${secondChatId}`)).json().chat.unreadCount).toBe(0);
        expect(
            (await asMember.get("/v0/notifications?unreadOnly=true"))
                .json()
                .notifications.map(
                    (notification: { messageId?: string }) => notification.messageId,
                ),
        ).not.toContain(unfollowedReply.json().message.id);

        const commonDifference = await asMember.post("/v0/sync/getDifference", {
            state: baseState,
            limit: 100,
        });
        expect(commonDifference.statusCode).toBe(200);
        expect(commonDifference.json().changedChats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: firstChatId, parentMessageId: rootMessageId }),
                expect.objectContaining({ id: secondChatId, parentMessageId: firstReplyId }),
                expect.objectContaining({ id: thirdChatId, parentMessageId: secondReplyId }),
            ]),
        );

        expect((await asLateMember.get(`/v0/chats/${thirdChatId}`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/chats/${firstChatId}`)).statusCode).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/addMember`, {
                    userId: lateMember.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asLateMember.get(`/v0/chats/${thirdChatId}`)).statusCode).toBe(200);
        expect(
            (
                await asLateMember.post(`/v0/chats/${thirdChatId}/sendMessage`, {
                    text: "A late parent member can use every existing descendant",
                })
            ).statusCode,
        ).toBe(201);

        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/archiveChannel`, {
                    leave: true,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asLateMember.post(`/v0/chats/${thirdChatId}/sendMessage`, {
                    text: "An archived ancestor makes every descendant read-only",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/unarchiveChannel`, {
                    join: true,
                })
            ).statusCode,
        ).toBe(200);

        expect((await asOwner.post(`/v0/messages/${firstReplyId}/deleteMessage`)).statusCode).toBe(
            200,
        );
        expect((await asOwner.get(`/v0/messages/${rootMessageId}`)).json().message).toMatchObject({
            threadChatId: firstChatId,
            threadReplyCount: 0,
        });
        expect((await asOwner.get(`/v0/chats/${secondChatId}`)).statusCode).toBe(200);

        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/removeMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        for (const chatId of [parentChatId, firstChatId, secondChatId, thirdChatId])
            expect((await asMember.get(`/v0/chats/${chatId}`)).statusCode).toBe(404);
        expect(
            (await asOwner.get("/v0/chats")).json().chats.map((chat: { id: string }) => chat.id),
        ).not.toEqual(expect.arrayContaining([firstChatId, secondChatId, thirdChatId]));

        expect((await asOwner.post(`/v0/chats/${parentChatId}/deleteChannel`, {})).statusCode).toBe(
            200,
        );
        for (const chatId of [parentChatId, firstChatId, secondChatId, thirdChatId])
            expect((await asOwner.get(`/v0/chats/${chatId}`)).statusCode).toBe(404);
    });

    it("inherits fixed direct-message membership without turning the child into a special message timeline", async () => {
        await using server = await createGymServer();
        const first = await server.createUser({ username: "thread_dm_first" });
        const second = await server.createUser({ username: "thread_dm_second" });
        const outsider = await server.createUser({ username: "thread_dm_outsider" });
        const asFirst = server.as(first);
        const asSecond = server.as(second);
        const asOutsider = server.as(outsider);

        const direct = await asFirst.post("/v0/chats/createDirectMessage", { userId: second.id });
        const directChatId = direct.json().chat.id as string;
        const root = await asFirst.post(`/v0/chats/${directChatId}/sendMessage`, {
            text: "Direct-message root",
        });
        const rootMessageId = root.json().message.id as string;
        const created = await asSecond.post(`/v0/messages/${rootMessageId}/createThread`, {});
        expect(created.statusCode).toBe(201);
        expect(created.json().chat).toMatchObject({
            kind: "dm",
            dmType: "direct",
            parentMessageId: rootMessageId,
            membershipRole: "member",
        });
        const threadChatId = created.json().chat.id as string;
        expect(
            (
                await asSecond.post(`/v0/chats/${threadChatId}/sendMessage`, {
                    text: "Normal message in the direct child chat",
                })
            ).statusCode,
        ).toBe(201);
        expect((await asFirst.get(`/v0/chats/${threadChatId}/messages`)).statusCode).toBe(200);
        expect((await asOutsider.get(`/v0/chats/${threadChatId}`)).statusCode).toBe(404);
    });

    it("keeps descendant ownership aligned when the selected parent owner leaves", async () => {
        await using server = await createGymServer();
        const creator = await server.createUser({ username: "thread_owner_creator" });
        const successor = await server.createUser({ username: "thread_owner_successor" });
        const asCreator = server.as(creator);
        const asSuccessor = server.as(successor);

        const parent = await asCreator.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Thread ownership tree",
            slug: "thread-ownership-tree",
        });
        const parentChatId = parent.json().chat.id as string;
        expect(
            (await asCreator.post(`/v0/chats/${parentChatId}/addMember`, { userId: successor.id }))
                .statusCode,
        ).toBe(200);
        const root = await asCreator.post(`/v0/chats/${parentChatId}/sendMessage`, {
            text: "Ownership root",
        });
        const child = await asCreator.post(
            `/v0/messages/${root.json().message.id as string}/createThread`,
            {},
        );
        const childChatId = child.json().chat.id as string;
        const reply = await asCreator.post(`/v0/chats/${childChatId}/sendMessage`, {
            text: "Ownership nested root",
        });
        const grandchild = await asCreator.post(
            `/v0/messages/${reply.json().message.id as string}/createThread`,
            {},
        );
        const grandchildChatId = grandchild.json().chat.id as string;

        expect(
            (
                await asCreator.post(`/v0/chats/${parentChatId}/setMemberRole`, {
                    userId: successor.id,
                    role: "owner",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asCreator.post(`/v0/chats/${parentChatId}/setMemberRole`, {
                    userId: creator.id,
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asSuccessor.post(`/v0/chats/${parentChatId}/setMemberRole`, {
                    userId: creator.id,
                    role: "owner",
                })
            ).statusCode,
        ).toBe(200);
        for (const chatId of [childChatId, grandchildChatId])
            expect((await asSuccessor.get(`/v0/chats/${chatId}`)).json().chat.ownerUserId).toBe(
                creator.id,
            );

        expect((await asCreator.post(`/v0/chats/${parentChatId}/leave`, {})).statusCode).toBe(200);
        for (const chatId of [parentChatId, childChatId, grandchildChatId]) {
            expect((await asSuccessor.get(`/v0/chats/${chatId}`)).json().chat).toMatchObject({
                ownerUserId: successor.id,
            });
            const departedOwner = await asCreator.get(`/v0/chats/${chatId}`);
            expect(departedOwner.statusCode).toBe(200);
            expect(departedOwner.json().chat.membershipRole).toBeUndefined();
        }
    });

    it("creates a new canonical child after the prior thread chat is deleted", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "thread_recreate_owner" });
        const member = await server.createUser({ username: "thread_recreate_member" });
        const asOwner = server.as(owner);

        const parent = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Thread recreation parent",
            slug: "thread-recreation-parent",
        });
        const parentChatId = parent.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${parentChatId}/addMember`, { userId: member.id }))
                .statusCode,
        ).toBe(200);
        const root = await asOwner.post(`/v0/chats/${parentChatId}/sendMessage`, {
            text: "Recreatable thread root",
        });
        const rootMessageId = root.json().message.id as string;
        const first = await asOwner.post(`/v0/messages/${rootMessageId}/createThread`, {});
        const firstChatId = first.json().chat.id as string;

        expect((await asOwner.post(`/v0/chats/${firstChatId}/deleteChannel`, {})).statusCode).toBe(
            200,
        );
        expect((await asOwner.get(`/v0/chats/${firstChatId}`)).statusCode).toBe(404);
        const afterDelete = (await asOwner.get(`/v0/messages/${rootMessageId}`)).json().message;
        expect(afterDelete.threadChatId).toBeUndefined();
        expect(afterDelete.threadReplyCount).toBe(0);

        const recreated = await asOwner.post(`/v0/messages/${rootMessageId}/createThread`, {});
        expect(recreated.statusCode).toBe(201);
        const recreatedChatId = recreated.json().chat.id as string;
        expect(recreatedChatId).not.toBe(firstChatId);
        expect((await asOwner.get(`/v0/messages/${rootMessageId}`)).json().message).toMatchObject({
            threadChatId: recreatedChatId,
            threadReplyCount: 0,
        });
        expect((await asOwner.get(`/v0/chats/${recreatedChatId}`)).statusCode).toBe(200);
    });
});
