import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database, type StoredFile, type User } from "../database.js";
import { CollaborationError } from "./types.js";
import { CollaborationRepository } from "./repository.js";

describe("CollaborationRepository", () => {
    let directory: string;
    let database: Database;
    let repository: CollaborationRepository;
    let url: string;
    let ada: User;
    let grace: User;
    let linus: User;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "rigged-collaboration-"));
        url = `file:${join(directory, "rigged.db")}`;
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

    it("stores agent provenance and atomically queues DMs without agent unread state", async () => {
        const agentUserId = "agent-user";
        const created = await repository.createAgent({
            actorUserId: ada.id,
            agentUserId,
            cwd: `/agents/${agentUserId}/users/${ada.id}`,
            name: "Fixer",
            sessionId: "rig-session",
            username: "fixer",
        });
        expect(created.chat).toMatchObject({
            kind: "dm",
            dmType: "direct",
            membershipRole: "owner",
        });
        expect(
            (await repository.listContacts()).find(({ id }) => id === agentUserId),
        ).toMatchObject({
            kind: "agent",
            createdByUserId: ada.id,
        });

        const sent = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: created.chat.id,
            text: "Queue this durably",
            agentTurn: { agentUserId, sessionId: "rig-session" },
        });
        const inspection = createClient({ url });
        try {
            const turn = await inspection.execute({
                sql: "SELECT status FROM agent_turns WHERE user_message_id = ? AND agent_user_id = ?",
                args: [sent.message.id, agentUserId],
            });
            expect(turn.rows).toHaveLength(1);
            expect(turn.rows[0]?.status).toBe("pending");
            const membership = await inspection.execute({
                sql: "SELECT unread_count FROM chat_members WHERE chat_id = ? AND user_id = ?",
                args: [created.chat.id, agentUserId],
            });
            expect(membership.rows[0]?.unread_count).toBe(0);
            const notifications = await inspection.execute({
                sql: "SELECT count(*) AS count FROM notifications WHERE user_id = ?",
                args: [agentUserId],
            });
            expect(notifications.rows[0]?.count).toBe(0);
        } finally {
            inspection.close();
        }
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

    it("publishes durable receipts and triggers after-read expiry", async () => {
        const channel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Read state",
            slug: "read-state",
        });
        await repository.joinPublicChannel(grace.id, channel.chat.id);
        const sent = await repository.sendAutomatedMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "This expires after it is read",
            clientMutationId: "automated-after-read",
        });
        const configured = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "Read once",
            expiryMode: "after_read",
            selfDestructSeconds: 60,
        });
        expect(sent.message.receipts).toEqual([
            expect.objectContaining({ userId: grace.id, deliveredAt: expect.any(String) }),
        ]);
        const beforeReadPts = Number(configured.hint.chats[0]!.pts);
        const read = await repository.markChatRead({
            actorUserId: grace.id,
            chatId: channel.chat.id,
            messageId: configured.message.id,
        });
        expect(read.hint.chats).toEqual([expect.objectContaining({ chatId: channel.chat.id })]);
        const projected = await repository.getMessage(ada.id, configured.message.id);
        expect(projected).toMatchObject({
            firstReadAt: expect.any(String),
            expiresAt: expect.any(String),
            receipts: [
                expect.objectContaining({
                    userId: grace.id,
                    readAt: expect.any(String),
                }),
            ],
        });
        const difference = await repository.getChatDifference({
            userId: ada.id,
            chatId: channel.chat.id,
            membershipEpoch: (await repository.getChat(ada.id, channel.chat.id)).membershipEpoch,
            fromPts: beforeReadPts,
            limit: 20,
        });
        expect(difference.updates).toContainEqual(
            expect.objectContaining({
                kind: "receipt.read",
                entityId: configured.message.id,
            }),
        );
        expect(difference.messages[0]?.receipts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ userId: grace.id, readAt: expect.any(String) }),
            ]),
        );
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

    it("syncs membership changes to both remaining and removed members", async () => {
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
        const remainingDifference = await repository.getDifference({
            userId: ada.id,
            generation: beforeRemoval.generation,
            fromSequence: Number(beforeRemoval.sequence),
            limit: 100,
        });
        expect(remainingDifference.changedChats.map((chat) => chat.id)).toContain(channel.chat.id);
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
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        await repository.editMessage({
            actorUserId: ada.id,
            messageId: sent.message.id,
            text: "This edited message expires",
        });
        await database.extensionClient().execute({
            sql: `UPDATE messages SET expires_at = datetime('now', '-1 second') WHERE id = ?`,
            args: [sent.message.id],
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
        await expect(
            repository.listMessageRevisions(ada.id, sent.message.id),
        ).rejects.toMatchObject({ code: "not_found" });
        const revisions = await database.extensionClient().execute({
            sql: `SELECT count(*) AS count FROM message_revisions WHERE message_id = ?`,
            args: [sent.message.id],
        });
        expect(Number(revisions.rows[0]?.count)).toBe(0);
    });

    it("checks an empty expiry sweep without competing for the SQLite write lock", async () => {
        const blocker = createClient({ url });
        const transaction = await blocker.transaction("write");
        try {
            await expect(repository.expireDueMessages()).resolves.toBeUndefined();
        } finally {
            await transaction.rollback();
            blocker.close();
        }
    });

    it("keeps access telemetry admin-only and prevents custom emoji file promotion by readers", async () => {
        const contacts = await repository.listContacts();
        expect(contacts.find((user) => user.id === grace.id)).not.toHaveProperty("lastAccessAt");
        const admins = await repository.listAdminUsers(ada.id);
        expect(admins.find((user) => user.id === grace.id)).toHaveProperty("lastAccessAt");

        const channel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Emoji Source",
            slug: "emoji-source",
        });
        await repository.addChannelMember({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: grace.id,
        });
        const file: StoredFile = {
            id: "private-emoji-image",
            userId: ada.id,
            uploadedByUserId: ada.id,
            isPublic: false,
            storageName: "private-emoji-image.gif",
            contentType: "image/gif",
            size: 43,
            width: 16,
            height: 16,
            thumbhash: "",
            kind: "gif",
            originalName: "secret.gif",
        };
        await database.createFile(file);
        await repository.sendMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "source",
            attachmentFileIds: [file.id],
        });
        await expect(
            repository.createCustomEmoji({
                actorUserId: grace.id,
                name: "not_mine",
                fileId: file.id,
            }),
        ).rejects.toMatchObject({ code: "not_found" });

        const emoji = await repository.createCustomEmoji({
            actorUserId: ada.id,
            name: "owned",
            fileId: file.id,
        });
        const message = await repository.sendMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "react here",
        });
        await repository.setReaction({
            actorUserId: grace.id,
            messageId: message.message.id,
            customEmojiId: emoji.emoji.id,
            active: true,
        });
        const deletion = await repository.deleteCustomEmoji(ada.id, emoji.emoji.id);
        expect(deletion.hint.chats.map(({ chatId }) => chatId)).toContain(channel.chat.id);
        expect((await repository.getMessage(ada.id, message.message.id)).reactions).toEqual([]);
    });

    it("transfers ownership when an owner is deleted and lets server admins recover channels", async () => {
        const channel = await repository.createChannel({
            actorUserId: grace.id,
            kind: "private_channel",
            name: "Owned by Grace",
            slug: "owned-by-grace",
        });
        await repository.addChannelMember({
            actorUserId: grace.id,
            chatId: channel.chat.id,
            userId: linus.id,
        });

        await repository.deleteUser({ actorUserId: ada.id, userId: grace.id });
        expect((await repository.getChat(linus.id, channel.chat.id)).membershipRole).toBe("owner");
        const updated = await repository.updateTopic(ada.id, channel.chat.id, "Recovered by admin");
        expect(updated.chat.topic).toBe("Recovered by admin");
    });

    it("compacts acknowledged sync history and makes stale cursors reset explicitly", async () => {
        const baseline = await repository.getState();
        const channel = await repository.createChannel({
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Compaction",
            slug: "compaction",
        });
        await repository.sendMessage({
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "old durable event",
        });
        const current = await repository.getState();
        await repository.acknowledgeSyncConsumer({
            userId: ada.id,
            deviceId: "desktop-test",
            generation: current.generation,
            sequence: Number(current.sequence),
        });
        await database
            .extensionClient()
            .batch(
                [
                    "UPDATE server_settings SET sync_event_retention_seconds = 1, chat_update_retention_seconds = 1",
                    "UPDATE sync_events SET created_at = datetime('now', '-2 days')",
                    "UPDATE chat_updates SET created_at = datetime('now', '-2 days')",
                ],
                "write",
            );
        const compacted = await repository.compactSync();
        expect(Number(compacted.minRecoverableSequence)).toBeGreaterThan(Number(baseline.sequence));
        expect(compacted.eventsDeleted).toBeGreaterThan(0);
        const difference = await repository.getDifference({
            userId: ada.id,
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });
        expect(difference).toMatchObject({ kind: "reset", areas: ["all"] });
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
