import { userCreateProfile } from "../user/userCreateProfile.js";
import { userFindActive } from "../user/userFindActive.js";
import { fileCreate } from "../file/fileCreate.js";
import { accountCreatePassword } from "../auth/accountCreatePassword.js";
import { userDelete } from "../user/userDelete.js";
import { userAdministrationList } from "../user/userAdministrationList.js";
import { syncInitialize } from "../sync/syncInitialize.js";
import { syncGetState } from "../sync/syncGetState.js";
import { syncGetDifference } from "../sync/syncGetDifference.js";
import { syncConsumerAcknowledge } from "../sync/syncConsumerAcknowledge.js";
import { syncCompact } from "../sync/syncCompact.js";
import { searchRun } from "../search/searchRun.js";
import { messageSendAutomated } from "../message/messageSendAutomated.js";
import { messageSend } from "../message/messageSend.js";
import { messageRevisionList } from "../message/messageRevisionList.js";
import { messageReactionSet } from "../message/messageReactionSet.js";
import { messageList } from "../message/messageList.js";
import { messageGet } from "../message/messageGet.js";
import { messageForward } from "../message/messageForward.js";
import { messageExpireDue } from "../message/messageExpireDue.js";
import { messageEdit } from "../message/messageEdit.js";
import { messageDelete } from "../message/messageDelete.js";
import { fileList } from "../file/fileList.js";
import { fileCanAccess } from "../file/fileCanAccess.js";
import { directMessageCreate } from "./directMessageCreate.js";
import { customEmojiDelete } from "../emoji/customEmojiDelete.js";
import { customEmojiCreate } from "../emoji/customEmojiCreate.js";
import { contactList } from "../user/contactList.js";
import { chatSyncGetDifference } from "../sync/chatSyncGetDifference.js";
import { chatStarSet } from "./chatStarSet.js";
import { chatMarkRead } from "./chatMarkRead.js";
import { chatGet } from "./chatGet.js";
import { channelTopicUpdate } from "./channelTopicUpdate.js";
import { channelMemberRemove } from "./channelMemberRemove.js";
import { channelMemberAdd } from "./channelMemberAdd.js";
import { channelJoin } from "./channelJoin.js";
import { channelCreate } from "./channelCreate.js";
import { agentTurnTakeNext } from "../agent/agentTurnTakeNext.js";
import { agentTurnComplete } from "../agent/agentTurnComplete.js";
import { agentTurnCheckpoint } from "../agent/agentTurnCheckpoint.js";
import { agentImageTakeBuild } from "../agent/agentImageTakeBuild.js";
import { agentImageSetDefault } from "../agent/agentImageSetDefault.js";
import { agentImageRequestBuild } from "../agent/agentImageRequestBuild.js";
import { agentImageList } from "../agent/agentImageList.js";
import { agentImageEnsureDefinitions } from "../agent/agentImageEnsureDefinitions.js";
import { agentImageCompleteBuild } from "../agent/agentImageCompleteBuild.js";
import { agentCreate } from "../agent/agentCreate.js";
import {
    agentImages,
    agentImageSettings,
    chatMembers,
    chats,
    serverSetupSteps,
    users,
} from "../schema.js";
import { setupCreateDefaultAgent } from "../setup/setupCreateDefaultAgent.js";
import { setupRecordOperationalStep } from "../setup/setupRecordOperationalStep.js";
import { createDatabase, type DrizzleExecutor } from "../drizzle.js";
import { createClient, type Client } from "@libsql/client";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StoredFile } from "../file/types.js";
import type { User } from "../user/types.js";
import { CollaborationError } from "./types.js";
import { and, eq, inArray } from "drizzle-orm";
describe("functional product actions", () => {
    let directory: string;
    let client: Client;
    let executor: DrizzleExecutor;
    let url: string;
    let ada: User;
    let grace: User;
    let linus: User;
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-collaboration-"));
        url = `file:${join(directory, "happy2.db")}`;
        client = createClient({ url });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        await syncInitialize(executor);
        ada = await createUser(executor, "ada@example.com", "ada", "Ada");
        const now = new Date().toISOString();
        await executor
            .update(serverSetupSteps)
            .set({
                state: "complete",
                startedAt: now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "bootstrap_administrator"));
        await executor.insert(agentImages).values({
            id: "functional-actions-ready-image",
            name: "Functional actions ready image",
            dockerfile: "FROM scratch",
            definitionHash: "functional-actions-ready-image",
            dockerTag: "happy2:functional-actions-ready-image",
            status: "ready",
            buildProgress: 100,
            dockerImageId: "sha256:functional-actions-ready-image",
            readyAt: new Date().toISOString(),
        });
        await executor
            .update(agentImageSettings)
            .set({ defaultImageId: "functional-actions-ready-image", updatedByUserId: ada.id });
        for (const step of [
            "sandbox_provider_selected",
            "sandbox_provider_validated",
            "base_image_selected",
            "base_image_build_requested",
            "base_image_ready",
        ] as const)
            await setupRecordOperationalStep(executor, {
                step,
                state: "complete",
                actorUserId: ada.id,
                ...(step.startsWith("base_image_")
                    ? { metadata: { imageId: "functional-actions-ready-image" } }
                    : {}),
            });
        await setupCreateDefaultAgent(executor, {
            actorUserId: ada.id,
            name: "Happy",
            username: "happy",
        });
        grace = await createUser(executor, "grace@example.com", "grace", "Grace");
        linus = await createUser(executor, "linus@example.com", "linus", "Linus");
    });
    afterEach(async () => {
        client.close();
        await rm(directory, {
            recursive: true,
            force: true,
        });
    });
    it("stores agent provenance, queues DMs, and guards terminal writes by worker lease", async () => {
        const agentUserId = "agent-user";
        await agentImageEnsureDefinitions(executor, [
            {
                buildContext: "test-context",
                builtinKey: "daycare-minimal",
                definitionHash: "test-image-hash",
                dockerTag: "happy2-agent:test-image-hash",
                dockerfile: "FROM scratch",
                name: "Test image",
            },
        ]);
        const testImage = (await agentImageList(executor, ada.id)).images.find(
            ({ builtinKey }) => builtinKey === "daycare-minimal",
        );
        expect(testImage).toBeDefined();
        const imageId = testImage!.id;
        await agentImageRequestBuild(executor, {
            actorUserId: ada.id,
            imageId,
        });
        expect(await agentImageTakeBuild(executor, imageId, "test-worker")).toBeDefined();
        await agentImageCompleteBuild(executor, {
            dockerImageId: "sha256:test-image",
            imageId,
            workerId: "test-worker",
        });
        await agentImageSetDefault(executor, {
            actorUserId: ada.id,
            imageId,
        });
        const created = await agentCreate(executor, {
            actorUserId: ada.id,
            agentUserId,
            agentEffort: "high",
            containerName: "test-container",
            cwd: `/agents/${agentUserId}/users/${ada.id}/workspace`,
            imageId,
            name: "Fixer",
            sessionId: "rig-session",
            username: "fixer",
        });
        expect(created.chat).toMatchObject({
            kind: "dm",
            dmType: "direct",
            membershipRole: "owner",
        });
        expect((await contactList(executor)).find(({ id }) => id === agentUserId)).toMatchObject({
            kind: "agent",
            createdByUserId: ada.id,
        });
        const sent = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: created.chat.id,
            text: "Queue this durably",
            audience: "agents",
            agentTurns: [
                {
                    agentUserId,
                    sessionId: "rig-session",
                },
            ],
        });
        const inspection = createClient({
            url,
        });
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
            expect(await agentTurnTakeNext(executor, created.chat.id, "worker-a")).toMatchObject({
                userMessageId: sent.message.id,
                workerId: "worker-a",
            });
            await inspection.execute({
                sql: "UPDATE agent_turns SET lease_expires_at = ? WHERE user_message_id = ? AND agent_user_id = ?",
                args: ["1970-01-01T00:00:00.000Z", sent.message.id, agentUserId],
            });
            expect(await agentTurnTakeNext(executor, created.chat.id, "worker-b")).toMatchObject({
                userMessageId: sent.message.id,
                workerId: "worker-b",
            });
            expect(
                await agentTurnCheckpoint(executor, {
                    agentUserId,
                    baselineMessageCount: 0,
                    userMessageId: sent.message.id,
                    workerId: "worker-a",
                }),
            ).toBe(false);
            expect(
                await agentTurnComplete(executor, {
                    actorUserId: ada.id,
                    agentUserId,
                    sessionId: "rig-session",
                    text: "A stale worker must not publish this.",
                    userMessageId: sent.message.id,
                    workerId: "worker-a",
                }),
            ).toBeUndefined();
            const reclaimed = await inspection.execute({
                sql: "SELECT status, worker_id FROM agent_turns WHERE user_message_id = ? AND agent_user_id = ?",
                args: [sent.message.id, agentUserId],
            });
            expect(reclaimed.rows[0]).toMatchObject({
                status: "running",
                worker_id: "worker-b",
            });
            const completed = await agentTurnComplete(executor, {
                actorUserId: ada.id,
                agentUserId,
                sessionId: "rig-session",
                text: "The current worker published this.",
                userMessageId: sent.message.id,
                workerId: "worker-b",
            });
            expect(completed?.message).toMatchObject({
                generationStatus: "complete",
                text: "The current worker published this.",
            });
        } finally {
            inspection.close();
        }
    });
    it("enforces chat privacy while advancing durable server and chat cursors", async () => {
        expect(ada.role).toBe("admin");
        expect(grace.role).toBe("member");
        const baseline = await syncGetState(executor);
        const created = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Compiler Team",
            slug: "compiler-team",
        });
        expect(created.chat.pts).toBe("1");
        await expect(chatGet(executor, linus.id, created.chat.id)).rejects.toMatchObject({
            code: "not_found",
        });
        const added = await channelMemberAdd(executor, {
            actorUserId: ada.id,
            chatId: created.chat.id,
            userId: grace.id,
            role: "admin",
        });
        await expect(
            channelMemberAdd(executor, {
                actorUserId: grace.id,
                chatId: created.chat.id,
                userId: linus.id,
                role: "owner",
            }),
        ).rejects.toMatchObject({
            code: "forbidden",
        });
        await expect(
            messageSend(executor, {
                actorUserId: grace.id,
                chatId: created.chat.id,
                text: "Forged automation",
                kind: "automated",
            }),
        ).rejects.toMatchObject({
            code: "forbidden",
        });
        const sent = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: created.chat.id,
            text: "A compiler is a kind of translator.",
            clientMutationId: "send-1",
        });
        const duplicate = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: created.chat.id,
            text: "This retry must not be inserted.",
            clientMutationId: "send-1",
        });
        expect(duplicate.message.id).toBe(sent.message.id);
        const difference = await syncGetDifference(executor, {
            userId: grace.id,
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });
        expect(difference.changedChats.map((chat) => chat.id)).toContain(created.chat.id);
        expect(Number(difference.state.sequence)).toBeGreaterThan(Number(baseline.sequence));
        expect(Number(sent.message.changePts)).toBeGreaterThan(1);
        const chatDifference = await chatSyncGetDifference(executor, {
            userId: grace.id,
            chatId: created.chat.id,
            membershipEpoch: (await chatGet(executor, grace.id, created.chat.id)).membershipEpoch,
            fromPts: 0,
            limit: 100,
        });
        expect(chatDifference.updates.map((update) => update.kind)).toContain("message.created");
        expect(added.hint.sequence).not.toBe(created.hint.sequence);
        await chatStarSet(executor, grace.id, created.chat.id, true);
        await chatStarSet(executor, grace.id, created.chat.id, false);
        expect((await chatGet(executor, grace.id, created.chat.id)).starred).toBe(false);
        const current = await syncGetState(executor);
        await expect(
            syncGetDifference(executor, {
                userId: grace.id,
                generation: current.generation,
                fromSequence: Number(current.sequence),
                untilSequence: Number(current.sequence) + 1,
                limit: 100,
            }),
        ).rejects.toMatchObject({
            code: "future_state",
        });
    });
    it("keeps quoted replies in their chat", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "public_channel",
            name: "General",
            slug: "general",
        });
        await channelJoin(executor, grace.id, channel.chat.id);
        const root = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "Should we ship?",
        });
        const quote = await messageSend(executor, {
            actorUserId: grace.id,
            chatId: channel.chat.id,
            text: "Yes, after the tests pass.",
            quotedMessageId: root.message.id,
        });
        const main = await messageList(executor, {
            userId: ada.id,
            chatId: channel.chat.id,
            limit: 100,
        });
        expect(
            main.messages.filter((message) => !message.service).map((message) => message.id),
        ).toEqual([root.message.id, quote.message.id]);
        expect(quote.message.quotedMessage?.id).toBe(root.message.id);
        const reacted = await messageReactionSet(executor, {
            actorUserId: ada.id,
            messageId: quote.message.id,
            emoji: "👍",
            active: true,
        });
        expect(reacted.message.reactions[0]).toMatchObject({
            count: 1,
            reacted: true,
        });
        await expect(
            messageReactionSet(executor, {
                actorUserId: ada.id,
                messageId: quote.message.id,
                emoji: "👍",
                customEmojiId: "also-custom",
                active: true,
            }),
        ).rejects.toMatchObject({
            code: "invalid",
        });
        const deleted = await messageDelete(executor, grace.id, quote.message.id);
        expect(deleted.message).toMatchObject({
            text: "",
            deletedAt: expect.any(String),
        });
    });
    it("publishes durable receipts and triggers after-read expiry", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Read state",
            slug: "read-state",
        });
        await channelJoin(executor, grace.id, channel.chat.id);
        const sent = await messageSendAutomated(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "This expires after it is read",
            clientMutationId: "automated-after-read",
        });
        const configured = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "Read once",
            expiryMode: "after_read",
            selfDestructSeconds: 60,
        });
        expect(sent.message.receipts).toEqual([
            expect.objectContaining({
                userId: grace.id,
                deliveredAt: expect.any(String),
            }),
        ]);
        const beforeReadPts = Number(configured.hint.chats[0]!.pts);
        const read = await chatMarkRead(executor, {
            actorUserId: grace.id,
            chatId: channel.chat.id,
            messageId: configured.message.id,
        });
        expect(read.hint.chats).toEqual([
            expect.objectContaining({
                chatId: channel.chat.id,
            }),
        ]);
        const projected = await messageGet(executor, ada.id, configured.message.id);
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
        const difference = await chatSyncGetDifference(executor, {
            userId: ada.id,
            chatId: channel.chat.id,
            membershipEpoch: (await chatGet(executor, ada.id, channel.chat.id)).membershipEpoch,
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
                expect.objectContaining({
                    userId: grace.id,
                    readAt: expect.any(String),
                }),
            ]),
        );
    });
    it("derives forwarded-file access from every live destination attachment", async () => {
        const privateChannel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Secret",
            slug: "secret",
        });
        await channelMemberAdd(executor, {
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
        await fileCreate(executor, file);
        const source = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: privateChannel.chat.id,
            text: "Private design",
            attachmentFileIds: [file.id],
        });
        expect(await fileCanAccess(executor, grace.id, file.id)).toBe(true);
        expect(await fileCanAccess(executor, linus.id, file.id)).toBe(false);
        const dm = await directMessageCreate(executor, grace.id, linus.id);
        await messageForward(executor, {
            actorUserId: grace.id,
            messageId: source.message.id,
            targetChatIds: [dm.chat.id],
        });
        expect(await fileCanAccess(executor, linus.id, file.id)).toBe(true);
        const files = await fileList(executor, {
            userId: linus.id,
            limit: 20,
        });
        expect(files.files.map((item) => item.id)).toContain(file.id);
    });
    it("returns fuzzy global results without leaking private messages", async () => {
        const visible = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Announcements",
            slug: "announcements",
        });
        await messageSend(executor, {
            actorUserId: ada.id,
            chatId: visible.chat.id,
            text: "Deployment completed successfully",
        });
        const hidden = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Acquisitions",
            slug: "acquisitions",
        });
        await messageSend(executor, {
            actorUserId: ada.id,
            chatId: hidden.chat.id,
            text: "ultrasecretword",
        });
        const fuzzy = await searchRun(executor, linus.id, "deplyment", 20);
        expect(fuzzy.some((result) => result.type === "message")).toBe(true);
        const privateSearch = await searchRun(executor, linus.id, "ultrasecretword", 20);
        expect(privateSearch).toEqual([]);
    });
    it("syncs membership changes to both remaining and removed members", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Temporary",
            slug: "temporary",
        });
        await channelMemberAdd(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: grace.id,
        });
        const beforeRemoval = await syncGetState(executor);
        await channelMemberRemove(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: grace.id,
        });
        const difference = await syncGetDifference(executor, {
            userId: grace.id,
            generation: beforeRemoval.generation,
            fromSequence: Number(beforeRemoval.sequence),
            limit: 100,
        });
        expect(difference.removedChatIds).toEqual([channel.chat.id]);
        const remainingDifference = await syncGetDifference(executor, {
            userId: ada.id,
            generation: beforeRemoval.generation,
            fromSequence: Number(beforeRemoval.sequence),
            limit: 100,
        });
        expect(remainingDifference.changedChats.map((chat) => chat.id)).toContain(channel.chat.id);
        await expect(chatGet(executor, grace.id, channel.chat.id)).rejects.toBeInstanceOf(
            CollaborationError,
        );
    });
    it("turns due self-destruct messages into durable tombstones", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Ephemeral",
            slug: "ephemeral",
        });
        const sent = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "This message expires",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        await messageEdit(executor, {
            actorUserId: ada.id,
            messageId: sent.message.id,
            text: "This edited message expires",
        });
        await client.execute({
            sql: `UPDATE messages SET expires_at = datetime('now', '-1 second') WHERE id = ?`,
            args: [sent.message.id],
        });
        const hint = await messageExpireDue(executor);
        expect(hint?.chats[0]?.chatId).toBe(channel.chat.id);
        const message = await messageGet(executor, ada.id, sent.message.id);
        expect(message).toMatchObject({
            text: "",
            deletedAt: expect.any(String),
        });
        const state = await chatGet(executor, ada.id, channel.chat.id);
        const difference = await chatSyncGetDifference(executor, {
            userId: ada.id,
            chatId: channel.chat.id,
            membershipEpoch: state.membershipEpoch,
            fromPts: Number(sent.message.changePts),
            limit: 100,
        });
        expect(difference.updates.map((update) => update.kind)).toContain("message.expired");
        await expect(messageRevisionList(executor, ada.id, sent.message.id)).rejects.toMatchObject({
            code: "not_found",
        });
        const revisions = await client.execute({
            sql: `SELECT count(*) AS count FROM message_revisions WHERE message_id = ?`,
            args: [sent.message.id],
        });
        expect(Number(revisions.rows[0]?.count)).toBe(0);
    });
    it("checks an empty expiry sweep without competing for the SQLite write lock", async () => {
        const blocker = createClient({
            url,
        });
        const transaction = await blocker.transaction("write");
        try {
            await expect(messageExpireDue(executor)).resolves.toBeUndefined();
        } finally {
            await transaction.rollback();
            blocker.close();
        }
    });
    it("keeps access telemetry admin-only and prevents custom emoji file promotion by readers", async () => {
        const contacts = await contactList(executor);
        expect(contacts.find((user) => user.id === grace.id)).not.toHaveProperty("lastAccessAt");
        const admins = await userAdministrationList(executor, ada.id);
        expect(admins.find((user) => user.id === grace.id)).toHaveProperty("lastAccessAt");
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "private_channel",
            name: "Emoji Source",
            slug: "emoji-source",
        });
        await channelMemberAdd(executor, {
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
        await fileCreate(executor, file);
        await messageSend(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "source",
            attachmentFileIds: [file.id],
        });
        await expect(
            customEmojiCreate(executor, {
                actorUserId: grace.id,
                name: "not_mine",
                fileId: file.id,
            }),
        ).rejects.toMatchObject({
            code: "not_found",
        });
        const emoji = await customEmojiCreate(executor, {
            actorUserId: ada.id,
            name: "owned",
            fileId: file.id,
        });
        const message = await messageSend(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "react here",
        });
        await messageReactionSet(executor, {
            actorUserId: grace.id,
            messageId: message.message.id,
            customEmojiId: emoji.emoji.id,
            active: true,
        });
        const deletion = await customEmojiDelete(executor, ada.id, emoji.emoji.id);
        expect(deletion.hint.chats.map(({ chatId }) => chatId)).toContain(channel.chat.id);
        expect((await messageGet(executor, ada.id, message.message.id)).reactions).toEqual([]);
    });
    it("transfers ownership when an owner is deleted and lets server admins recover channels", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: grace.id,
            kind: "private_channel",
            name: "Owned by Grace",
            slug: "owned-by-grace",
        });
        await channelMemberAdd(executor, {
            actorUserId: grace.id,
            chatId: channel.chat.id,
            userId: linus.id,
        });
        expect(await userFindActive(executor, linus.id)).toMatchObject({ id: linus.id });
        await userDelete(executor, {
            actorUserId: ada.id,
            userId: grace.id,
        });
        expect((await chatGet(executor, linus.id, channel.chat.id)).membershipRole).toBe("owner");
        const updated = await channelTopicUpdate(
            executor,
            ada.id,
            channel.chat.id,
            "Recovered by admin",
        );
        expect(updated.chat.topic).toBe("Recovered by admin");
    });
    it("skips inactive co-owners when deleting the current channel owner", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: grace.id,
            kind: "private_channel",
            name: "Eligible Successor",
            slug: "eligible-successor",
        });
        await channelMemberAdd(executor, {
            actorUserId: grace.id,
            chatId: channel.chat.id,
            userId: linus.id,
            role: "owner",
        });
        await channelMemberAdd(executor, {
            actorUserId: grace.id,
            chatId: channel.chat.id,
            userId: ada.id,
        });
        await executor
            .update(chats)
            .set({ ownerUserId: grace.id })
            .where(eq(chats.id, channel.chat.id));
        await executor
            .update(chatMembers)
            .set({ role: "owner" })
            .where(and(eq(chatMembers.chatId, channel.chat.id), eq(chatMembers.userId, grace.id)));
        await executor.update(users).set({ active: 0 }).where(eq(users.id, linus.id));

        await userDelete(executor, {
            actorUserId: ada.id,
            userId: grace.id,
        });

        expect((await chatGet(executor, ada.id, channel.chat.id)).membershipRole).toBe("owner");
    });
    it("skips inactive human co-owners when a server admin removes the current owner", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: grace.id,
            kind: "private_channel",
            name: "Removed owner successor",
            slug: "removed-owner-successor",
        });
        await channelMemberAdd(executor, {
            actorUserId: grace.id,
            chatId: channel.chat.id,
            userId: linus.id,
            role: "owner",
        });
        await channelMemberAdd(executor, {
            actorUserId: linus.id,
            chatId: channel.chat.id,
            userId: ada.id,
        });
        await executor
            .update(chatMembers)
            .set({ role: "owner" })
            .where(and(eq(chatMembers.chatId, channel.chat.id), eq(chatMembers.userId, grace.id)));
        await executor.update(users).set({ active: 0 }).where(eq(users.id, grace.id));

        await channelMemberRemove(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: linus.id,
        });

        expect((await chatGet(executor, ada.id, channel.chat.id)).membershipRole).toBe("owner");
    });
    it("clears legacy public ownership instead of transferring it during removal", async () => {
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Legacy public owner",
            slug: "legacy-public-owner",
        });
        await channelMemberAdd(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: grace.id,
        });
        await executor
            .update(chats)
            .set({ ownerUserId: ada.id })
            .where(eq(chats.id, channel.chat.id));
        await executor
            .update(chatMembers)
            .set({ role: "owner" })
            .where(
                and(
                    eq(chatMembers.chatId, channel.chat.id),
                    inArray(chatMembers.userId, [ada.id, grace.id]),
                ),
            );

        await channelMemberRemove(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            userId: ada.id,
        });

        const [state] = await executor
            .select({ ownerUserId: chats.ownerUserId })
            .from(chats)
            .where(eq(chats.id, channel.chat.id));
        const [graceMembership] = await executor
            .select({ role: chatMembers.role })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, channel.chat.id), eq(chatMembers.userId, grace.id)));
        expect(state?.ownerUserId).toBeNull();
        expect(graceMembership?.role).toBe("admin");
    });
    it("compacts acknowledged sync history and makes stale cursors reset explicitly", async () => {
        const baseline = await syncGetState(executor);
        const channel = await channelCreate(executor, {
            actorUserId: ada.id,
            kind: "public_channel",
            name: "Compaction",
            slug: "compaction",
        });
        await messageSend(executor, {
            actorUserId: ada.id,
            chatId: channel.chat.id,
            text: "old durable event",
        });
        const current = await syncGetState(executor);
        await syncConsumerAcknowledge(executor, {
            userId: ada.id,
            deviceId: "desktop-test",
            generation: current.generation,
            sequence: Number(current.sequence),
        });
        await client.batch(
            [
                "UPDATE server_settings SET sync_event_retention_seconds = 1, chat_update_retention_seconds = 1",
                "UPDATE sync_events SET created_at = datetime('now', '-2 days')",
                "UPDATE chat_updates SET created_at = datetime('now', '-2 days')",
            ],
            "write",
        );
        const compacted = await syncCompact(executor);
        expect(Number(compacted.minRecoverableSequence)).toBeGreaterThan(Number(baseline.sequence));
        expect(compacted.eventsDeleted).toBeGreaterThan(0);
        const difference = await syncGetDifference(executor, {
            userId: ada.id,
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });
        expect(difference).toMatchObject({
            kind: "reset",
            areas: ["all"],
        });
    });
});
async function createUser(
    executor: DrizzleExecutor,
    email: string,
    username: string,
    firstName: string,
): Promise<User> {
    const account = await accountCreatePassword(executor, email, "not-used-by-this-test");
    return userCreateProfile(
        executor,
        account.id,
        {
            firstName,
            username,
            email,
        },
        {
            provisioned: true,
        },
    );
}
