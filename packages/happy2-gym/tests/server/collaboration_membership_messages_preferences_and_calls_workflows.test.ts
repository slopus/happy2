import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("collaboration membership, messages, personal organization, and calls", () => {
    it("keeps direct conversations exact and makes channel roles and lifecycle predictable", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "collab_admin", firstName: "Admin" });
        const owner = await server.createUser({ username: "channel_owner", firstName: "Owner" });
        const member = await server.createUser({ username: "channel_member", firstName: "Member" });
        const third = await server.createUser({ username: "channel_third", firstName: "Third" });
        const outsider = await server.createUser({
            username: "channel_outsider",
            firstName: "Outsider",
        });
        const asAdmin = server.as(admin);
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        const asThird = server.as(third);
        const asOutsider = server.as(outsider);

        const direct = await asOwner.post("/v0/chats/createDirectMessage", { userId: member.id });
        expect(direct.statusCode).toBe(201);
        const directId = direct.json().chat.id as string;
        expect(direct.json().chat).toMatchObject({ kind: "dm", dmType: "direct" });
        const reverseDirect = await asMember.post("/v0/chats/createDirectMessage", {
            userId: owner.id,
        });
        expect(reverseDirect.statusCode).toBe(200);
        expect(reverseDirect.json().chat.id).toBe(directId);
        expect((await asOutsider.get(`/v0/chats/${directId}`)).statusCode).toBe(404);
        expect(
            (await asOwner.post(`/v0/chats/${directId}/addMember`, { userId: third.id }))
                .statusCode,
        ).toBe(400);

        const group = await asOwner.post("/v0/chats/createGroupDirectMessage", {
            userIds: [member.id, third.id],
            name: "Exact trio",
        });
        expect(group.statusCode).toBe(201);
        const groupId = group.json().chat.id as string;
        expect(group.json().chat).toMatchObject({
            kind: "dm",
            dmType: "group",
            name: "Exact trio",
        });
        const sameGroup = await asMember.post("/v0/chats/createGroupDirectMessage", {
            userIds: [owner.id, third.id],
            name: "A different client-side name must not create another group",
        });
        expect(sameGroup.statusCode).toBe(200);
        expect(sameGroup.json().chat.id).toBe(groupId);
        expect(
            (await asThird.get(`/v0/chats/${groupId}/members`))
                .json()
                .users.map((user: { id: string }) => user.id),
        ).toEqual(expect.arrayContaining([owner.id, member.id, third.id]));
        expect((await asOwner.post(`/v0/chats/${groupId}/leave`)).statusCode).toBe(400);
        expect(
            (
                await asOwner.post("/v0/chats/createGroupDirectMessage", {
                    userIds: [member.id],
                })
            ).statusCode,
        ).toBe(400);

        const privateChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Role laboratory",
            slug: "role-laboratory",
            topic: "Membership starts private",
        });
        expect(privateChannel.statusCode).toBe(201);
        const privateChannelId = privateChannel.json().chat.id as string;
        expect((await asOutsider.get(`/v0/chats/${privateChannelId}`)).statusCode).toBe(404);
        expect(
            (await asOwner.post(`/v0/chats/${privateChannelId}/addMember`, { userId: member.id }))
                .statusCode,
        ).toBe(200);
        expect(
            (await asMember.post(`/v0/chats/${privateChannelId}/updateTopic`, { topic: "No" }))
                .statusCode,
        ).toBe(403);
        expect(
            (
                await asOwner.post(`/v0/chats/${privateChannelId}/setMemberRole`, {
                    userId: member.id,
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);
        const managerTopic = await asMember.post(`/v0/chats/${privateChannelId}/updateTopic`, {
            topic: "Managed topic",
        });
        expect(managerTopic.statusCode).toBe(200);
        expect(managerTopic.json().chat.topic).toBe("Managed topic");
        expect(
            (
                await asMember.post(`/v0/chats/${privateChannelId}/setMemberRole`, {
                    userId: owner.id,
                    role: "owner",
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await asOwner.post(`/v0/chats/${privateChannelId}/setMemberRole`, {
                    userId: member.id,
                    role: "owner",
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOwner.post(`/v0/chats/${privateChannelId}/leave`)).statusCode).toBe(200);
        const departedOwner = await asOwner.get(`/v0/chats/${privateChannelId}`);
        expect(departedOwner.statusCode).toBe(200);
        expect(departedOwner.json().chat.membershipRole).toBeUndefined();
        expect((await asMember.get(`/v0/chats/${privateChannelId}`)).json().chat).toMatchObject({
            ownerUserId: member.id,
            membershipRole: "owner",
        });
        expect(
            (
                await asMember.post(`/v0/chats/${privateChannelId}/archiveChannel`, {
                    leave: true,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (await asMember.post(`/v0/chats/${privateChannelId}/sendMessage`, { text: "blocked" }))
                .statusCode,
        ).toBe(404);
        expect(
            (
                await asMember.post(`/v0/chats/${privateChannelId}/unarchiveChannel`, {
                    join: true,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (await asMember.post(`/v0/chats/${privateChannelId}/deleteChannel`, {})).statusCode,
        ).toBe(200);
        expect((await asMember.get(`/v0/chats/${privateChannelId}`)).statusCode).toBe(404);

        const publicChannel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Discoverable channel",
            slug: "discoverable-channel",
        });
        expect(publicChannel.statusCode).toBe(201);
        const publicChannelId = publicChannel.json().chat.id as string;
        expect((await asOutsider.get(`/v0/chats/${publicChannelId}`)).json().chat).toMatchObject({
            id: publicChannelId,
            kind: "public_channel",
        });
        const joined = await asOutsider.post(`/v0/chats/${publicChannelId}/join`);
        expect(joined.statusCode).toBe(200);
        expect(joined.json().chat.membershipRole).toBe("member");
        expect((await asOutsider.post(`/v0/chats/${publicChannelId}/join`)).statusCode).toBe(409);
        expect(
            (
                await asAdmin.post(`/v0/chats/${publicChannelId}/removeMember`, {
                    userId: outsider.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOutsider.post(`/v0/chats/${publicChannelId}/join`)).statusCode).toBe(404);
        expect(
            (
                await asAdmin.post(`/v0/chats/${publicChannelId}/addMember`, {
                    userId: outsider.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOutsider.get(`/v0/chats/${publicChannelId}`)).json().chat).toMatchObject({
            membershipRole: "member",
        });
    });

    it("keeps quoted replies and child-chat threads distinct while preserving edits, forwards, reactions, pins, and bookmarks", async () => {
        await using server = await createGymServer();
        const author = await server.createUser({ username: "message_author", firstName: "Author" });
        const replier = await server.createUser({
            username: "message_replier",
            firstName: "Replier",
        });
        const target = await server.createUser({ username: "forward_target", firstName: "Target" });
        const destinationViewer = await server.createUser({
            username: "forward_viewer",
            firstName: "Forward viewer",
        });
        const asAuthor = server.as(author);
        const asReplier = server.as(replier);
        const asTarget = server.as(target);
        const asDestinationViewer = server.as(destinationViewer);

        const source = await asAuthor.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Message source",
            slug: "message-source",
        });
        expect(source.statusCode).toBe(201);
        const sourceChatId = source.json().chat.id as string;
        for (const userId of [replier.id, target.id])
            expect(
                (await asAuthor.post(`/v0/chats/${sourceChatId}/addMember`, { userId })).statusCode,
            ).toBe(200);

        const forwardTarget = await asAuthor.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Forward target",
            slug: "forward-target",
        });
        expect(forwardTarget.statusCode).toBe(201);
        const forwardTargetId = forwardTarget.json().chat.id as string;
        expect(
            (await asAuthor.post(`/v0/chats/${forwardTargetId}/addMember`, { userId: target.id }))
                .statusCode,
        ).toBe(200);
        expect(
            (
                await asAuthor.post(`/v0/chats/${forwardTargetId}/addMember`, {
                    userId: destinationViewer.id,
                })
            ).statusCode,
        ).toBe(200);

        const root = await asAuthor.post(`/v0/chats/${sourceChatId}/sendMessage`, {
            text: "Root message for quote, thread, edit, and forward",
        });
        expect(root.statusCode).toBe(201);
        const rootId = root.json().message.id as string;

        const quote = await asReplier.post(`/v0/chats/${sourceChatId}/sendMessage`, {
            text: "This is explicitly a quoted reply in the same chat timeline.",
            quotedMessageId: rootId,
        });
        expect(quote.statusCode).toBe(201);
        const quoteId = quote.json().message.id as string;
        expect(quote.json().message).toMatchObject({
            id: quoteId,
            quotedMessage: {
                id: rootId,
                text: "Root message for quote, thread, edit, and forward",
            },
        });
        expect(quote.json().message.threadChatId).toBeUndefined();

        const createdThread = await asReplier.post(`/v0/messages/${rootId}/createThread`, {});
        expect(createdThread.statusCode).toBe(201);
        const threadChatId = createdThread.json().chat.id as string;
        const threadReply = await asReplier.post(`/v0/chats/${threadChatId}/sendMessage`, {
            text: "This is a separate thread timeline.",
        });
        expect(threadReply.statusCode).toBe(201);
        const threadReplyId = threadReply.json().message.id as string;
        expect(threadReply.json().message).toMatchObject({
            chatId: threadChatId,
        });
        const mainTimeline = await asAuthor.get(`/v0/chats/${sourceChatId}/messages`);
        expect(mainTimeline.statusCode).toBe(200);
        expect(mainTimeline.json().messages.map((message: { id: string }) => message.id)).toEqual(
            expect.arrayContaining([rootId, quoteId]),
        );
        expect(
            mainTimeline.json().messages.map((message: { id: string }) => message.id),
        ).not.toContain(threadReplyId);
        const threadTimeline = await asAuthor.get(`/v0/chats/${threadChatId}/messages`);
        expect(threadTimeline.statusCode).toBe(200);
        expect(threadTimeline.json().messages.map((message: { id: string }) => message.id)).toEqual(
            [threadReplyId],
        );
        expect((await asAuthor.get("/v0/threads?unreadOnly=false")).json().threads).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: threadChatId,
                    parentMessageId: rootId,
                    lastMessageSequence: "1",
                }),
            ]),
        );
        expect(
            (
                await asReplier.post(`/v0/chats/${threadChatId}/updateNotificationPreferences`, {
                    notificationLevel: "mentions",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asReplier.post(`/v0/chats/${threadChatId}/markRead`, {
                    messageId: threadReplyId,
                })
            ).statusCode,
        ).toBe(200);

        const edited = await asAuthor.post(`/v0/messages/${rootId}/editMessage`, {
            text: "Root message revised exactly once",
            reason: "Clarified the workflow",
            expectedRevision: 1,
        });
        expect(edited.statusCode).toBe(200);
        expect(edited.json().message).toMatchObject({ revision: 2, editedAt: expect.any(String) });
        expect(
            (
                await asReplier.post(`/v0/messages/${rootId}/editMessage`, {
                    text: "A non-author cannot edit this",
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await asAuthor.post(`/v0/messages/${rootId}/editMessage`, {
                    text: "A stale edit must not win",
                    expectedRevision: 1,
                })
            ).statusCode,
        ).toBe(409);
        expect((await asAuthor.get(`/v0/messages/${rootId}/revisions`)).json().revisions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ revision: 1 }),
                expect.objectContaining({ revision: 2, text: "Root message revised exactly once" }),
            ]),
        );

        const unicodeReaction = await asReplier.post(`/v0/messages/${rootId}/addReaction`, {
            emoji: "👍",
        });
        expect(unicodeReaction.statusCode).toBe(200);
        expect(unicodeReaction.json().message.reactions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    emoji: "👍",
                    count: 1,
                    reacted: true,
                    userIds: [replier.id],
                }),
            ]),
        );
        expect(
            (await asReplier.post(`/v0/messages/${rootId}/removeReaction`, { emoji: "👍" }))
                .statusCode,
        ).toBe(200);

        const emojiFile = await uploadGif(asAuthor, "workflow.gif");
        const customEmoji = await asAuthor.post("/v0/customEmoji/createCustomEmoji", {
            name: "workflow_ok",
            fileId: emojiFile.id,
        });
        expect(customEmoji.statusCode).toBe(201);
        const customEmojiId = customEmoji.json().emoji.id as string;
        expect((await asReplier.get("/v0/customEmoji")).json().emoji).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: customEmojiId, name: "workflow_ok" }),
            ]),
        );
        expect((await asDestinationViewer.get("/v0/directory")).json().customEmoji).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: customEmojiId, name: "workflow_ok" }),
            ]),
        );
        const customReaction = await asReplier.post(`/v0/messages/${rootId}/addReaction`, {
            customEmojiId,
        });
        expect(customReaction.statusCode).toBe(200);
        expect(customReaction.json().message.reactions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ customEmojiId, count: 1, reacted: true }),
            ]),
        );
        expect(
            (await asReplier.post(`/v0/customEmoji/${customEmojiId}/deleteCustomEmoji`)).statusCode,
        ).toBe(403);
        expect(
            (await asAuthor.post(`/v0/customEmoji/${customEmojiId}/deleteCustomEmoji`)).statusCode,
        ).toBe(200);
        expect((await asAuthor.get(`/v0/messages/${rootId}`)).json().message.reactions).toEqual([]);

        expect((await asReplier.post(`/v0/messages/${rootId}/pinMessage`)).statusCode).toBe(200);
        const pins = await asAuthor.get(`/v0/chats/${sourceChatId}/pins`);
        expect(pins.statusCode).toBe(200);
        expect(pins.json().pins).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: expect.objectContaining({ id: rootId }),
                    pinnedByUserId: replier.id,
                }),
            ]),
        );
        expect((await asAuthor.post(`/v0/messages/${rootId}/unpinMessage`)).statusCode).toBe(200);

        const linkBookmark = await asReplier.post(`/v0/chats/${sourceChatId}/createBookmark`, {
            kind: "link",
            title: "Runbook",
            url: "https://example.com/runbook",
            emoji: "📘",
        });
        expect(linkBookmark.statusCode).toBe(201);
        const linkBookmarkId = linkBookmark.json().bookmark.id as string;
        const messageBookmark = await asAuthor.post(`/v0/chats/${sourceChatId}/createBookmark`, {
            kind: "message",
            title: "Root reference",
            messageId: rootId,
        });
        expect(messageBookmark.statusCode).toBe(201);
        expect(
            (await asAuthor.get(`/v0/chats/${sourceChatId}/bookmarks`)).json().bookmarks,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: linkBookmarkId, kind: "link" }),
                expect.objectContaining({ kind: "message", messageId: rootId }),
            ]),
        );
        expect(
            (
                await asTarget.post(`/v0/chats/${sourceChatId}/deleteBookmark`, {
                    bookmarkId: linkBookmarkId,
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await asReplier.post(`/v0/chats/${sourceChatId}/deleteBookmark`, {
                    bookmarkId: linkBookmarkId,
                })
            ).statusCode,
        ).toBe(200);

        const forwarded = await asAuthor.post(`/v0/messages/${rootId}/forwardMessage`, {
            targetChatIds: [forwardTargetId],
            clientMutationId: "forward-root-once",
        });
        expect(forwarded.statusCode).toBe(201);
        const forwardedMessageId = forwarded.json().messages[0].id as string;
        expect(forwarded.json().messages[0]).toMatchObject({
            chatId: forwardTargetId,
            text: "Root message revised exactly once",
            forwardedFrom: { messageId: rootId, chatId: sourceChatId },
        });
        const replayedForward = await asAuthor.post(`/v0/messages/${rootId}/forwardMessage`, {
            targetChatIds: [forwardTargetId],
            clientMutationId: "forward-root-once",
        });
        expect(replayedForward.statusCode).toBe(201);
        expect(replayedForward.json().messages[0].id).toBe(forwardedMessageId);
        expect((await asAuthor.post(`/v0/messages/${quoteId}/deleteMessage`)).statusCode).toBe(200);
        expect((await asAuthor.get(`/v0/messages/${quoteId}`)).json().message).toMatchObject({
            id: quoteId,
            text: "",
            deletedAt: expect.any(String),
        });
        expect((await asTarget.get(`/v0/messages/${forwardedMessageId}`)).statusCode).toBe(200);
        expect((await asDestinationViewer.get(`/v0/chats/${sourceChatId}`)).statusCode).toBe(404);
        expect(
            (await asDestinationViewer.get(`/v0/messages/${forwardedMessageId}`)).json().message,
        ).toMatchObject({
            id: forwardedMessageId,
            text: "Root message revised exactly once",
        });
        expect(
            (await asDestinationViewer.get(`/v0/messages/${forwardedMessageId}`)).json().message,
        ).not.toHaveProperty("forwardedFrom");
    });

    it("keeps personal organization, notification, directory, search, and presence views scoped", async () => {
        await using server = await createGymServer();
        const author = await server.createUser({
            username: "organizer_author",
            firstName: "Author",
        });
        const member = await server.createUser({
            username: "organizer_member",
            firstName: "Member",
        });
        const outsider = await server.createUser({
            username: "fuzzy_finder",
            firstName: "Fuzzy",
            lastName: "Finder",
        });
        const asAuthor = server.as(author);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);

        const first = await asAuthor.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Release planning",
            slug: "release-planning",
            topic: "Plans and milestones",
        });
        const second = await asAuthor.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Support triage",
            slug: "support-triage",
        });
        expect(first.statusCode).toBe(201);
        expect(second.statusCode).toBe(201);
        const firstChatId = first.json().chat.id as string;
        const secondChatId = second.json().chat.id as string;
        for (const chatId of [firstChatId, secondChatId])
            expect((await asMember.post(`/v0/chats/${chatId}/join`)).statusCode).toBe(200);

        expect(
            (await asMember.post(`/v0/chats/${firstChatId}/setStar`, { starred: true })).statusCode,
        ).toBe(200);
        expect(
            (await asMember.post(`/v0/chats/${secondChatId}/setStar`, { starred: true }))
                .statusCode,
        ).toBe(200);
        expect(
            (
                await asMember.post("/v0/chats/reorderStarred", {
                    chatIds: [secondChatId, firstChatId],
                })
            ).statusCode,
        ).toBe(200);
        const starred = (await asMember.get("/v0/chats"))
            .json()
            .chats.filter((chat: { starred: boolean }) => chat.starred);
        expect(starred.map((chat: { id: string }) => chat.id)).toEqual([secondChatId, firstChatId]);

        expect(
            (
                await asMember.post(`/v0/chats/${firstChatId}/updateNotificationPreferences`, {
                    notificationLevel: "mentions",
                    notifyThreadReplies: false,
                    showMessagePreviews: false,
                })
            ).statusCode,
        ).toBe(200);
        const quietMessage = await asAuthor.post(`/v0/chats/${firstChatId}/sendMessage`, {
            text: "A regular update should not notify a mentions-only member.",
        });
        expect(quietMessage.statusCode).toBe(201);
        const mention = await asAuthor.post(`/v0/chats/${firstChatId}/sendMessage`, {
            text: "Please review this, @organizer_member",
        });
        expect(mention.statusCode).toBe(201);
        const mentionId = mention.json().message.id as string;
        const unreadNotifications = await asMember.get("/v0/notifications?unreadOnly=true");
        expect(unreadNotifications.statusCode).toBe(200);
        expect(unreadNotifications.json().notifications).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "mention", messageId: mentionId }),
            ]),
        );
        expect(
            unreadNotifications
                .json()
                .notifications.some(
                    (notification: { messageId?: string }) =>
                        notification.messageId === quietMessage.json().message.id,
                ),
        ).toBe(false);
        const mentionNotificationId = unreadNotifications
            .json()
            .notifications.find(
                (notification: { kind: string; messageId?: string }) =>
                    notification.kind === "mention" && notification.messageId === mentionId,
            ).id as string;
        expect(
            (
                await asMember.post("/v0/notifications/markRead", {
                    notificationIds: [mentionNotificationId],
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (await asMember.get("/v0/notifications?unreadOnly=true"))
                .json()
                .notifications.map((notification: { id: string }) => notification.id),
        ).not.toContain(mentionNotificationId);

        const read = await asMember.post(`/v0/chats/${firstChatId}/markRead`, {
            messageId: mentionId,
        });
        expect(read.statusCode).toBe(200);
        expect(read.json().chat).toMatchObject({ unreadCount: 0, mentionCount: 0 });
        const globalPreferences = await asMember.post("/v0/me/updateNotificationPreferences", {
            directMessages: "none",
            mentions: "all",
            threadReplies: "mentions",
            reactions: "none",
            calls: "none",
            emailNotifications: true,
            desktopNotifications: false,
            dndStartMinutes: 60,
            dndEndMinutes: 120,
            timezone: "America/Los_Angeles",
        });
        expect(globalPreferences.statusCode).toBe(200);
        expect(
            (await asMember.get("/v0/me/notificationPreferences")).json().preferences,
        ).toMatchObject({
            directMessages: "none",
            threadReplies: "mentions",
            reactions: "none",
            calls: "none",
            emailNotifications: true,
            desktopNotifications: false,
            dndStartMinutes: 60,
            dndEndMinutes: 120,
            timezone: "America/Los_Angeles",
        });

        const presence = await asMember.post("/v0/me/updateStatus", {
            availability: "away",
            customStatusText: "Reviewing the release plan",
            customStatusEmoji: "🧪",
        });
        expect(presence.statusCode).toBe(200);
        expect(presence.json().status).toMatchObject({
            userId: member.id,
            availability: "away",
            customStatusText: "Reviewing the release plan",
        });
        const contacts = await asOutsider.get("/v0/contacts");
        expect(contacts.statusCode).toBe(200);
        expect(contacts.json().users.map((user: { id: string }) => user.id)).toEqual(
            expect.arrayContaining([author.id, member.id, outsider.id]),
        );
        expect(contacts.json().statuses).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ userId: member.id, availability: "away" }),
            ]),
        );
        expect((await asOutsider.get("/v0/presence")).json().statuses).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ userId: member.id, availability: "away" }),
            ]),
        );
        expect((await asOutsider.get("/v0/directory/users")).json().users).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: author.id })]),
        );
        const directory = await asOutsider.get("/v0/directory");
        expect(directory.statusCode).toBe(200);
        expect(directory.json().channels).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: firstChatId }),
                expect.objectContaining({ id: secondChatId }),
            ]),
        );
        expect((await asOutsider.get("/v0/directory/channels")).json().channels).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: firstChatId })]),
        );

        const fuzzySearch = await asMember.get("/v0/search?q=relese%20plannng&limit=50");
        expect(fuzzySearch.statusCode).toBe(200);
        expect(fuzzySearch.json().results).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "channel",
                    channel: expect.objectContaining({ id: firstChatId }),
                }),
                expect.objectContaining({
                    type: "message",
                    message: expect.objectContaining({ id: mentionId }),
                }),
            ]),
        );
        const userSearch = await asMember.get("/v0/search?q=fzzy%20findr&limit=50");
        expect(userSearch.statusCode).toBe(200);
        expect(userSearch.json().results).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "user",
                    user: expect.objectContaining({ id: outsider.id }),
                }),
            ]),
        );
    });

    it("waits for every delivered reader before expiring an all-readers message", async () => {
        await using server = await createGymServer();
        const author = await server.createUser({ username: "expiry_author" });
        const firstReader = await server.createUser({ username: "expiry_first_reader" });
        const secondReader = await server.createUser({ username: "expiry_second_reader" });
        const asAuthor = server.as(author);
        const asFirstReader = server.as(firstReader);
        const asSecondReader = server.as(secondReader);
        const channel = await asAuthor.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Expiry defaults",
            slug: "expiry-defaults",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        for (const userId of [firstReader.id, secondReader.id])
            expect(
                (await asAuthor.post(`/v0/chats/${chatId}/addMember`, { userId })).statusCode,
            ).toBe(200);
        expect(
            (
                await asAuthor.post(`/v0/chats/${chatId}/updatePolicies`, {
                    defaultExpiryMode: "after_read",
                    defaultSelfDestructSeconds: 60,
                    defaultAfterReadScope: "all_readers",
                })
            ).statusCode,
        ).toBe(200);
        const sent = await asAuthor.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "This message is retained until every recipient has read it.",
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;
        expect(sent.json().message).toMatchObject({
            expiryMode: "after_read",
            selfDestructSeconds: 60,
        });
        expect(sent.json().message.expiresAt).toBeUndefined();
        expect(
            (await asFirstReader.post(`/v0/chats/${chatId}/markRead`, { messageId })).statusCode,
        ).toBe(200);
        expect(
            (await asAuthor.get(`/v0/messages/${messageId}`)).json().message.expiresAt,
        ).toBeUndefined();
        expect(
            (await asSecondReader.post(`/v0/chats/${chatId}/markRead`, { messageId })).statusCode,
        ).toBe(200);
        expect((await asAuthor.get(`/v0/messages/${messageId}`)).json().message).toMatchObject({
            id: messageId,
            expiryMode: "after_read",
            selfDestructSeconds: 60,
            firstReadAt: expect.any(String),
            expiresAt: expect.any(String),
            receipts: expect.arrayContaining([
                expect.objectContaining({ userId: firstReader.id, readAt: expect.any(String) }),
                expect.objectContaining({ userId: secondReader.id, readAt: expect.any(String) }),
            ]),
        });
    });

    it("treats punctuation after a username as a mention boundary", async () => {
        await using server = await createGymServer();
        const sender = await server.createUser({ username: "punctuation_sender" });
        const recipient = await server.createUser({ username: "punctuation_recipient" });
        const asSender = server.as(sender);
        const asRecipient = server.as(recipient);
        const channel = await asSender.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Mention punctuation",
            slug: "mention-punctuation",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asSender.post(`/v0/chats/${chatId}/addMember`, { userId: recipient.id }))
                .statusCode,
        ).toBe(200);
        expect(
            (
                await asRecipient.post(`/v0/chats/${chatId}/updateNotificationPreferences`, {
                    notificationLevel: "mentions",
                })
            ).statusCode,
        ).toBe(200);

        const sent = await asSender.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Please review this, @punctuation_recipient.",
        });
        expect(sent.statusCode).toBe(201);
        expect(sent.json().message.mentions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    userId: recipient.id,
                    rawText: "@punctuation_recipient",
                }),
            ]),
        );
        expect(
            (await asRecipient.get("/v0/notifications?unreadOnly=true")).json().notifications,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "mention", messageId: sent.json().message.id }),
            ]),
        );
    });

    it("keeps call status and participation scoped to chat members", async () => {
        await using server = await createGymServer();
        const caller = await server.createUser({ username: "call_caller", firstName: "Caller" });
        const invitee = await server.createUser({ username: "call_invitee", firstName: "Invitee" });
        const silencedInvitee = await server.createUser({
            username: "call_silenced_invitee",
            firstName: "Silenced invitee",
        });
        const outsider = await server.createUser({
            username: "call_outsider",
            firstName: "Outsider",
        });
        const asCaller = server.as(caller);
        const asInvitee = server.as(invitee);
        const asSilencedInvitee = server.as(silencedInvitee);
        const asOutsider = server.as(outsider);

        const channel = await asCaller.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Call room",
            slug: "call-room",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        for (const userId of [invitee.id, silencedInvitee.id])
            expect(
                (await asCaller.post(`/v0/chats/${chatId}/addMember`, { userId })).statusCode,
            ).toBe(200);
        expect(
            (
                await asSilencedInvitee.post("/v0/me/updateNotificationPreferences", {
                    calls: "none",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asOutsider.post(`/v0/chats/${chatId}/createCall`, {
                    kind: "video",
                    invitedUserIds: [invitee.id],
                })
            ).statusCode,
        ).toBe(404);

        const created = await asCaller.post(`/v0/chats/${chatId}/createCall`, {
            kind: "video",
            invitedUserIds: [invitee.id, silencedInvitee.id],
        });
        expect(created.statusCode).toBe(201);
        const callId = created.json().call.id as string;
        expect(created.json().call).toMatchObject({
            id: callId,
            chatId,
            kind: "video",
            status: "ringing",
            participants: expect.arrayContaining([
                expect.objectContaining({ userId: caller.id, status: "joined" }),
                expect.objectContaining({ userId: invitee.id, status: "ringing" }),
                expect.objectContaining({ userId: silencedInvitee.id, status: "ringing" }),
            ]),
        });
        expect((await asOutsider.get(`/v0/calls/${callId}`)).statusCode).toBe(404);
        expect(
            (await asInvitee.get("/v0/notifications?unreadOnly=true")).json().notifications,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "call", chatId, actorUserId: caller.id }),
            ]),
        );
        expect(
            (await asSilencedInvitee.get("/v0/notifications?unreadOnly=true")).json().notifications,
        ).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "call", chatId })]));
        expect((await asSilencedInvitee.post(`/v0/calls/${callId}/declineCall`)).statusCode).toBe(
            200,
        );
        const joined = await asInvitee.post(`/v0/calls/${callId}/joinCall`);
        expect(joined.statusCode).toBe(200);
        expect(joined.json().call.status).toBe("active");
        expect(joined.json().call.participants).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ userId: invitee.id, status: "joined" }),
            ]),
        );
        expect((await asInvitee.get(`/v0/calls?chatId=${chatId}`)).json().calls).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: callId, status: "active" })]),
        );
        expect((await asInvitee.post(`/v0/calls/${callId}/leaveCall`)).statusCode).toBe(200);
        const ended = await asCaller.post(`/v0/calls/${callId}/endCall`, {
            reason: "Meeting complete",
        });
        expect(ended.statusCode).toBe(200);
        expect(ended.json().call).toMatchObject({
            status: "ended",
            endReason: "Meeting complete",
            endedAt: expect.any(String),
        });
        expect((await asInvitee.post(`/v0/calls/${callId}/joinCall`)).statusCode).toBe(409);
    });
});

async function uploadGif(
    client: GymRequestClient,
    filename: string,
): Promise<{ id: string; kind: string }> {
    const boundary = "happy2-collaboration-workflow-boundary";
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
    const payload = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/gif\r\n\r\n`,
        ),
        gif,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await client.post("/v0/files/upload", payload, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().file.kind).toBe("gif");
    return response.json().file;
}
