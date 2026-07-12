import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database, type StoredFile, type User } from "../database.js";
import { CollaborationError } from "./types.js";
import { CollaborationRepository } from "./repository.js";

describe("CollaborationRepository", () => {
    let directory: string;
    let database: Database;
    let repository: CollaborationRepository;
    let ada: User;
    let grace: User;
    let linus: User;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "rigged-collaboration-"));
        const url = `file:${join(directory, "rigged.db")}`;
        database = new Database(url);
        await database.migrate();
        repository = new CollaborationRepository(url);
        await repository.initialize();
        ada = await createUser(database, "ada@example.com", "ada", "Ada");
        grace = await createUser(database, "grace@example.com", "grace", "Grace");
        linus = await createUser(database, "linus@example.com", "linus", "Linus");
    });

    afterEach(async () => {
        repository.close();
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it("enforces chat privacy while advancing durable server and chat cursors", async () => {
        expect(ada.role).toBe("admin");
        expect(grace.role).toBe("member");
        const baseline = await repository.getState();
        const created = await repository.createChannel({
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Compiler Team",
            slug: "compiler-team",
        });
        expect(created.chat.pts).toBe("1");
        await expect(repository.getChat(linus.id, created.chat.id)).rejects.toMatchObject({
            code: "not_found",
        });
        const added = await repository.addChannelMember({
            actorUserId: ada.id,
            chatId: created.chat.id,
            userId: grace.id,
            role: "admin",
        });
        await expect(
            repository.addChannelMember({
                actorUserId: grace.id,
                chatId: created.chat.id,
                userId: linus.id,
                role: "owner",
            }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
            repository.sendMessage({
                actorUserId: grace.id,
                chatId: created.chat.id,
                text: "Forged automation",
                kind: "automated",
            }),
        ).rejects.toMatchObject({ code: "forbidden" });
        const sent = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: created.chat.id,
            text: "A compiler is a kind of translator.",
            clientMutationId: "send-1",
        });
        const duplicate = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: created.chat.id,
            text: "This retry must not be inserted.",
            clientMutationId: "send-1",
        });
        expect(duplicate.message.id).toBe(sent.message.id);

        const difference = await repository.getDifference({
            userId: grace.id,
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });
        expect(difference.changedChats.map((chat) => chat.id)).toContain(created.chat.id);
        expect(Number(difference.state.sequence)).toBeGreaterThan(Number(baseline.sequence));
        expect(Number(sent.message.changePts)).toBeGreaterThan(1);

        const chatDifference = await repository.getChatDifference({
            userId: grace.id,
            chatId: created.chat.id,
            membershipEpoch: (await repository.getChat(grace.id, created.chat.id)).membershipEpoch,
            fromPts: 0,
            limit: 100,
        });
        expect(chatDifference.updates.map((update) => update.kind)).toContain("message.created");
        expect(added.hint.sequence).not.toBe(created.hint.sequence);
        await repository.setStar(grace.id, created.chat.id, true);
        await repository.setStar(grace.id, created.chat.id, false);
        expect((await repository.getChat(grace.id, created.chat.id)).starred).toBe(false);
        const current = await repository.getState();
        await expect(
            repository.getDifference({
                userId: grace.id,
                generation: current.generation,
                fromSequence: Number(current.sequence),
                untilSequence: Number(current.sequence) + 1,
                limit: 100,
            }),
        ).rejects.toMatchObject({ code: "future_state" });
    });

    it("keeps quoted replies in chat and thread replies on a separate timeline", async () => {
        const channel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "public_channel",
            name: "General",
            slug: "general",
        });
        await repository.joinPublicChannel(grace.id, channel.chat.id);
        const root = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "Should we ship?",
        });
        const quote = await repository.sendMessage({
            actorUserId: grace.id,
            chatId: channel.chat.id,
            text: "Yes, after the tests pass.",
            quotedMessageId: root.message.id,
        });
        const thread = await repository.sendMessage({
            actorUserId: grace.id,
            chatId: channel.chat.id,
            text: "Detailed rollout notes",
            threadRootMessageId: root.message.id,
        });
        const main = await repository.listMessages({
            userId: ada.id,
            chatId: channel.chat.id,
            limit: 100,
        });
        expect(main.messages.map((message) => message.id)).toEqual([
            root.message.id,
            quote.message.id,
        ]);
        expect(quote.message.quotedMessage?.id).toBe(root.message.id);
        const replies = await repository.listMessages({
            userId: ada.id,
            chatId: channel.chat.id,
            threadRootMessageId: root.message.id,
            limit: 100,
        });
        expect(replies.messages.map((message) => message.id)).toEqual([thread.message.id]);

        const reacted = await repository.setReaction({
            actorUserId: ada.id,
            messageId: quote.message.id,
            emoji: "👍",
            active: true,
        });
        expect(reacted.message.reactions[0]).toMatchObject({ count: 1, reacted: true });
        await expect(
            repository.setReaction({
                actorUserId: ada.id,
                messageId: quote.message.id,
                emoji: "👍",
                customEmojiId: "also-custom",
                active: true,
            }),
        ).rejects.toMatchObject({ code: "invalid" });
        const deleted = await repository.deleteMessage(grace.id, quote.message.id);
        expect(deleted.message).toMatchObject({ text: "", deletedAt: expect.any(String) });
    });

    it("derives forwarded-file access from every live destination attachment", async () => {
        const privateChannel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Secret",
            slug: "secret",
        });
        await repository.addChannelMember({
            actorUserId: ada.id,
            chatId: privateChannel.chat.id,
            userId: grace.id,
        });
        const file: StoredFile = {
            id: "file-forwarding-test",
            userId: ada.id,
            uploadedByUserId: ada.id,
            isPublic: false,
            storageName: "file-forwarding-test.blob",
            contentType: "application/pdf",
            size: 12,
            width: 0,
            height: 0,
            thumbhash: "",
            kind: "file",
            originalName: "compiler.pdf",
        };
        await database.createFile(file);
        const source = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: privateChannel.chat.id,
            text: "Private design",
            attachmentFileIds: [file.id],
        });
        expect(await repository.canAccessFile(grace.id, file.id)).toBe(true);
        expect(await repository.canAccessFile(linus.id, file.id)).toBe(false);

        const dm = await repository.createDirectMessage(grace.id, linus.id);
        await repository.forwardMessage({
            actorUserId: grace.id,
            messageId: source.message.id,
            targetChatIds: [dm.chat.id],
        });
        expect(await repository.canAccessFile(linus.id, file.id)).toBe(true);
        const files = await repository.listFiles({ userId: linus.id, limit: 20 });
        expect(files.files.map((item) => item.id)).toContain(file.id);
    });

    it("returns fuzzy global results without leaking private messages", async () => {
        const visible = await repository.createChannel({
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Announcements",
            slug: "announcements",
        });
        await repository.sendMessage({
            actorUserId: ada.id,
            chatId: visible.chat.id,
            text: "Deployment completed successfully",
        });
        const hidden = await repository.createChannel({
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Acquisitions",
            slug: "acquisitions",
        });
        await repository.sendMessage({
            actorUserId: ada.id,
            chatId: hidden.chat.id,
            text: "ultrasecretword",
        });
        const fuzzy = await repository.search(linus.id, "deplyment", 20);
        expect(fuzzy.some((result) => result.type === "message")).toBe(true);
        const privateSearch = await repository.search(linus.id, "ultrasecretword", 20);
        expect(privateSearch).toEqual([]);
    });

    it("reports a removed private chat to the removed member", async () => {
        const channel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Temporary",
            slug: "temporary",
        });
        await repository.addChannelMember({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: grace.id,
        });
        const beforeRemoval = await repository.getState();
        await repository.removeChannelMember({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: grace.id,
        });
        const difference = await repository.getDifference({
            userId: grace.id,
            generation: beforeRemoval.generation,
            fromSequence: Number(beforeRemoval.sequence),
            limit: 100,
        });
        expect(difference.removedChatIds).toEqual([channel.chat.id]);
        await expect(repository.getChat(grace.id, channel.chat.id)).rejects.toBeInstanceOf(
            CollaborationError,
        );
    });

    it("turns due self-destruct messages into durable tombstones", async () => {
        const channel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Ephemeral",
            slug: "ephemeral",
        });
        const sent = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "This message expires",
            expiresAt: new Date(Date.now() - 1_000).toISOString(),
        });
        const hint = await repository.expireDueMessages();
        expect(hint?.chats[0]?.chatId).toBe(channel.chat.id);
        const message = await repository.getMessage(ada.id, sent.message.id);
        expect(message).toMatchObject({ text: "", deletedAt: expect.any(String) });
        const state = await repository.getChat(ada.id, channel.chat.id);
        const difference = await repository.getChatDifference({
            userId: ada.id,
            chatId: channel.chat.id,
            membershipEpoch: state.membershipEpoch,
            fromPts: Number(sent.message.changePts),
            limit: 100,
        });
        expect(difference.updates.map((update) => update.kind)).toContain("message.expired");
    });
});

async function createUser(
    database: Database,
    email: string,
    username: string,
    firstName: string,
): Promise<User> {
    const account = await database.createPasswordAccount(email, "not-used-by-this-test");
    return database.createProfile(account.id, { firstName, username, email });
}
