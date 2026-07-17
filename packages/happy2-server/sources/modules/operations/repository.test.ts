import { createClient, type Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database, type Account, type StoredFile, type User } from "../database.js";
import { OperationsRepository } from "./repository.js";

interface TestIdentity {
    account: Account;
    user: User;
}

describe("OperationsRepository", () => {
    let directory: string;
    let database: Database;
    let raw: Client;
    let repository: OperationsRepository;
    let admin: TestIdentity;
    let member: TestIdentity;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-operations-"));
        const url = `file:${join(directory, "happy2.db")}`;
        database = new Database(url);
        await database.migrate();
        raw = createClient({ url });
        repository = new OperationsRepository(url);
        admin = await createUser(database, "admin@example.com", "admin", "Ada");
        member = await createUser(database, "member@example.com", "member", "Grace");
    });

    afterEach(async () => {
        repository.close();
        raw.close();
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it("applies and revokes reasoned bans atomically with session revocation and audit telemetry", async () => {
        const session = await database.createSession(
            member.account.id,
            new Date(Date.now() + 60_000),
            { ip: "203.0.113.9" },
        );
        const ban = await repository.applyBan({
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Repeated abuse",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            context: {
                request: {
                    ip: "198.51.100.12",
                    device: "Happy (2) Desktop",
                    appVersion: "1.2.3",
                    userAgent: "happy2/1.2.3",
                },
            },
        });
        expect(ban).toMatchObject({
            userId: member.user.id,
            reason: "Repeated abuse",
            status: "active",
        });
        expect(await database.findActiveSession(session.id)).toBeUndefined();
        await expect(
            database.createSession(member.account.id, new Date(Date.now() + 60_000), {}),
        ).rejects.toThrow("not allowed");

        const audit = await repository.listAuditLog({ actorUserId: admin.user.id, limit: 20 });
        expect(audit.items[0]).toMatchObject({
            action: "user.ban_applied",
            targetId: member.user.id,
            clientIp: "198.51.100.12",
            device: "Happy (2) Desktop",
        });
        expect(audit.items[0]?.metadata).toMatchObject({ revokedSessionCount: 1 });

        const revoked = await repository.revokeBan({
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Appeal accepted",
        });
        expect(revoked).toMatchObject({ status: "revoked", revokeReason: "Appeal accepted" });
        await expect(
            database.createSession(member.account.id, new Date(Date.now() + 60_000), {}),
        ).resolves.toMatchObject({ accountId: member.account.id });
        const history = await repository.listBans({
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            limit: 20,
        });
        expect(history.items).toHaveLength(1);
    });

    it("expires elapsed bans idempotently and records a system audit entry", async () => {
        await repository.applyBan({
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
        await raw.execute({
            sql: `UPDATE accounts SET ban_expires_at = ? WHERE id = ?`,
            args: [new Date(Date.now() - 1_000).toISOString(), member.account.id],
        });
        await raw.execute({
            sql: `UPDATE account_bans SET expires_at = ? WHERE account_id = ?`,
            args: [new Date(Date.now() - 1_000).toISOString(), member.account.id],
        });
        await expect(repository.expireDueBans()).resolves.toBe(1);
        await expect(repository.expireDueBans()).resolves.toBe(0);
        await expect(
            database.createSession(member.account.id, new Date(Date.now() + 60_000), {}),
        ).resolves.toBeDefined();
        const audit = await repository.listAuditLog({
            actorUserId: admin.user.id,
            action: "user.ban_expired",
            limit: 10,
        });
        expect(audit.items).toHaveLength(1);
        expect(audit.items[0]).toMatchObject({ actorUserId: undefined, targetId: member.user.id });
    });

    it("accepts privacy-checked reports and durably resolves them with moderation actions", async () => {
        const report = await repository.createReport({
            actorUserId: member.user.id,
            targetUserId: admin.user.id,
            reason: "Inappropriate profile content",
            details: "Please review the title.",
        });
        expect(report).toMatchObject({ status: "open", reportedByUserId: member.user.id });
        await expect(
            repository.listReports({ actorUserId: member.user.id, limit: 20 }),
        ).rejects.toMatchObject({ code: "forbidden" });

        const reviewing = await repository.updateReport({
            actorUserId: admin.user.id,
            reportId: report.id,
            status: "reviewing",
            assignedToUserId: admin.user.id,
        });
        expect(reviewing).toMatchObject({ status: "reviewing", assignedToUserId: admin.user.id });
        const acted = await repository.takeModerationAction({
            actorUserId: admin.user.id,
            reportId: report.id,
            action: "warn",
            reason: "Content policy reminder sent",
            metadata: { template: "profile-content-v1" },
        });
        expect(acted.report).toMatchObject({ status: "resolved" });
        expect(acted.action).toMatchObject({
            action: "warn",
            metadata: { template: "profile-content-v1" },
        });
        expect(acted.sync).toMatchObject({ areas: ["notifications"] });
        expect(
            (
                await raw.execute({
                    sql: `SELECT kind, user_id, sync_sequence FROM notifications
                           WHERE user_id = ? ORDER BY created_at`,
                    args: [admin.user.id],
                })
            ).rows,
        ).toMatchObject([{ kind: "moderation", user_id: admin.user.id }]);

        const restrictionReport = await repository.createReport({
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Repeated disruptive posting",
        });
        const restriction = await repository.takeModerationAction({
            actorUserId: admin.user.id,
            reportId: restrictionReport.id,
            action: "restrict",
            reason: "Posting paused pending review",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
        expect(restriction.action).toMatchObject({
            action: "restrict",
            targetUserId: member.user.id,
        });
        const revokedRestriction = await repository.revokeModerationAction({
            actorUserId: admin.user.id,
            actionId: restriction.action.id,
            reason: "Review completed",
        });
        expect(revokedRestriction.action.revokedAt).toEqual(expect.any(String));
        expect(revokedRestriction.sync).toMatchObject({ areas: ["notifications"] });
        expect(
            (
                await raw.execute({
                    sql: `SELECT count(*) AS count FROM notifications WHERE user_id = ? AND kind = 'moderation'`,
                    args: [member.user.id],
                })
            ).rows[0]?.count,
        ).toBe(2);
        await expect(
            repository.revokeModerationAction({
                actorUserId: admin.user.id,
                actionId: restriction.action.id,
            }),
        ).rejects.toMatchObject({ code: "conflict" });
        const queue = await repository.listReports({
            actorUserId: admin.user.id,
            status: "resolved",
            limit: 20,
        });
        expect(queue.items.map((item) => item.id)).toContain(report.id);
    });

    it("redacts moderated messages and quarantines files while advancing durable chat sync", async () => {
        const chatId = await createChat(raw, admin.user.id, member.user.id, admin.user.id);
        const removedMessageId = createId();
        const attachmentMessageId = createId();
        await raw.batch([
            {
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, text, content_json)
                      VALUES (?, ?, 1, 1, ?, 'searchable abuse', '{"kind":"text"}')`,
                args: [removedMessageId, chatId, member.user.id],
            },
            {
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, text)
                      VALUES (?, ?, 2, 2, ?, 'file attachment')`,
                args: [attachmentMessageId, chatId, member.user.id],
            },
            {
                sql: `INSERT INTO message_search_documents
                        (message_id, chat_id, normalized_text, normalized_length, gram_count,
                         indexed_revision, message_created_at)
                      VALUES (?, ?, 'searchable abuse', 16, 14, 1, CURRENT_TIMESTAMP)`,
                args: [removedMessageId, chatId],
            },
            {
                sql: `INSERT INTO message_search_ngrams (gram, message_id) VALUES ('abu', ?)`,
                args: [removedMessageId],
            },
            {
                sql: `INSERT INTO message_revisions
                        (id, message_id, revision, text, content_json, edited_by_user_id)
                      VALUES (?, ?, 1, 'searchable abuse', '{"kind":"text"}', ?)`,
                args: [createId(), removedMessageId, member.user.id],
            },
            {
                sql: `UPDATE chats SET pts = 2, last_message_sequence = 2,
                             last_change_sequence = 2 WHERE id = ?`,
                args: [chatId],
            },
        ]);

        const messageReport = await repository.createReport({
            actorUserId: admin.user.id,
            chatId,
            messageId: removedMessageId,
            reason: "Abusive message",
        });
        const removedMessage = await repository.takeModerationAction({
            actorUserId: admin.user.id,
            reportId: messageReport.id,
            action: "remove_message",
            reason: "Policy violation",
        });
        expect(removedMessage.action).toMatchObject({
            action: "remove_message",
            chatId,
            messageId: removedMessageId,
        });
        expect(removedMessage.sync?.chats).toEqual([{ chatId, pts: "3" }]);
        const messageRow = (
            await raw.execute({
                sql: `SELECT text, content_json, deleted_at, deleted_by_user_id, delete_reason,
                             change_pts FROM messages WHERE id = ?`,
                args: [removedMessageId],
            })
        ).rows[0]!;
        expect(messageRow).toMatchObject({
            text: "",
            content_json: null,
            deleted_by_user_id: admin.user.id,
            delete_reason: "Policy violation",
            change_pts: 3,
        });
        expect(messageRow.deleted_at).toEqual(expect.any(String));
        expect(
            (
                await raw.execute({
                    sql: `SELECT count(*) AS count FROM message_search_documents WHERE message_id = ?`,
                    args: [removedMessageId],
                })
            ).rows[0]?.count,
        ).toBe(0);
        expect(
            (
                await raw.execute({
                    sql: `SELECT count(*) AS count FROM message_revisions WHERE message_id = ?`,
                    args: [removedMessageId],
                })
            ).rows[0]?.count,
        ).toBe(0);

        const file: StoredFile = {
            id: createId(),
            userId: member.user.id,
            uploadedByUserId: member.user.id,
            isPublic: true,
            storageName: "reported-file.bin",
            contentType: "application/octet-stream",
            size: 64,
            width: 0,
            height: 0,
            thumbhash: "",
            kind: "file",
        };
        await database.createFile(file);
        await raw.batch([
            {
                sql: `INSERT INTO message_attachments (message_id, file_id, position)
                      VALUES (?, ?, 0)`,
                args: [attachmentMessageId, file.id],
            },
            {
                sql: `INSERT INTO file_access_grants
                        (id, file_id, principal_type, principal_id, granted_by_user_id)
                      VALUES (?, ?, 'chat', ?, ?)`,
                args: [createId(), file.id, chatId, admin.user.id],
            },
        ]);
        const fileReport = await repository.createReport({
            actorUserId: admin.user.id,
            chatId,
            fileId: file.id,
            reason: "Unsafe attachment",
        });
        const removedFile = await repository.takeModerationAction({
            actorUserId: admin.user.id,
            reportId: fileReport.id,
            action: "remove_file",
            reason: "Quarantined by moderation",
        });
        expect(removedFile.action).toMatchObject({ action: "remove_file", fileId: file.id });
        expect(removedFile.sync).toMatchObject({
            chats: [{ chatId, pts: "4" }],
            areas: ["files"],
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT deleted_at, deleted_by_user_id, delete_reason, access_scope,
                                 is_public, orphaned_at FROM files WHERE id = ?`,
                    args: [file.id],
                })
            ).rows[0],
        ).toMatchObject({
            deleted_by_user_id: admin.user.id,
            delete_reason: "Quarantined by moderation",
            access_scope: "private",
            is_public: 0,
            deleted_at: expect.any(String),
            orphaned_at: expect.any(String),
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT count(*) AS count FROM file_access_grants WHERE file_id = ?`,
                    args: [file.id],
                })
            ).rows[0]?.count,
        ).toBe(0);
    });

    it("recomputes thread projections when moderation removes a reply", async () => {
        const chatId = await createChat(raw, admin.user.id, member.user.id, admin.user.id);
        const rootMessageId = createId();
        const survivingReplyId = createId();
        const removedReplyId = createId();
        await raw.batch([
            {
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, text)
                      VALUES (?, ?, 1, 1, ?, 'thread root')`,
                args: [rootMessageId, chatId, admin.user.id],
            },
            {
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, text,
                         thread_root_message_id)
                      VALUES (?, ?, 2, 2, ?, 'surviving reply', ?)`,
                args: [survivingReplyId, chatId, admin.user.id, rootMessageId],
            },
            {
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, text,
                         thread_root_message_id)
                      VALUES (?, ?, 3, 3, ?, 'removed reply', ?)`,
                args: [removedReplyId, chatId, member.user.id, rootMessageId],
            },
            {
                sql: `INSERT INTO threads
                        (root_message_id, chat_id, created_by_user_id, reply_count, last_pts,
                         last_reply_message_id, last_reply_sequence, participant_count)
                      VALUES (?, ?, ?, 2, 3, ?, 3, 2)`,
                args: [rootMessageId, chatId, admin.user.id, removedReplyId],
            },
            {
                sql: `INSERT INTO thread_participants
                        (thread_root_message_id, user_id, reply_count)
                      VALUES (?, ?, 1), (?, ?, 1)`,
                args: [rootMessageId, admin.user.id, rootMessageId, member.user.id],
            },
            {
                sql: `INSERT INTO thread_user_states
                        (thread_root_message_id, user_id, last_read_sequence, unread_count,
                         mention_count)
                      VALUES (?, ?, 0, 1, 1), (?, ?, 0, 1, 0)`,
                args: [rootMessageId, admin.user.id, rootMessageId, member.user.id],
            },
            {
                sql: `INSERT INTO message_mentions
                        (id, message_id, kind, mentioned_user_id, start_offset, length, raw_text)
                      VALUES (?, ?, 'user', ?, 0, 6, '@admin')`,
                args: [createId(), removedReplyId, admin.user.id],
            },
            {
                sql: `UPDATE chats SET pts = 3, last_message_sequence = 3,
                             last_change_sequence = 3 WHERE id = ?`,
                args: [chatId],
            },
        ]);

        const report = await repository.createReport({
            actorUserId: admin.user.id,
            chatId,
            messageId: removedReplyId,
            reason: "Thread reply violates policy",
        });
        const removed = await repository.takeModerationAction({
            actorUserId: admin.user.id,
            reportId: report.id,
            action: "remove_message",
        });
        expect(removed.sync?.chats).toEqual([{ chatId, pts: "4" }]);
        expect(
            (
                await raw.execute({
                    sql: `SELECT reply_count, participant_count, last_reply_message_id,
                                 last_reply_sequence, last_pts
                            FROM threads WHERE root_message_id = ?`,
                    args: [rootMessageId],
                })
            ).rows[0],
        ).toMatchObject({
            reply_count: 1,
            participant_count: 1,
            last_reply_message_id: survivingReplyId,
            last_reply_sequence: 2,
            last_pts: 4,
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT user_id, reply_count FROM thread_participants
                           WHERE thread_root_message_id = ?`,
                    args: [rootMessageId],
                })
            ).rows,
        ).toEqual([{ user_id: admin.user.id, reply_count: 1 }]);
        expect(
            (
                await raw.execute({
                    sql: `SELECT unread_count, mention_count FROM thread_user_states
                           WHERE thread_root_message_id = ? AND user_id = ?`,
                    args: [rootMessageId, admin.user.id],
                })
            ).rows[0],
        ).toMatchObject({ unread_count: 0, mention_count: 0 });
        expect(
            (
                await raw.execute({
                    sql: `SELECT change_pts FROM messages WHERE id = ?`,
                    args: [rootMessageId],
                })
            ).rows[0]?.change_pts,
        ).toBe(4);
    });

    it("deletes users by revoking sessions, anonymizing identity, and transferring ownership", async () => {
        const chatId = await createChat(raw, admin.user.id, member.user.id, member.user.id);
        const session = await database.createSession(
            member.account.id,
            new Date(Date.now() + 60_000),
            {},
        );
        const report = await repository.createReport({
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Account removal required",
        });
        const deleted = await repository.takeModerationAction({
            actorUserId: admin.user.id,
            reportId: report.id,
            action: "delete_user",
            reason: "Confirmed abusive account",
        });
        expect(deleted.action).toMatchObject({
            action: "delete_user",
            targetUserId: member.user.id,
        });
        expect(deleted.sync).toMatchObject({
            chats: expect.arrayContaining([{ chatId, pts: "1" }]),
            areas: ["users"],
        });
        expect(await database.findActiveSession(session.id)).toBeUndefined();
        expect(
            (
                await raw.execute({
                    sql: `SELECT active, deleted_at, password_hash, email FROM accounts WHERE id = ?`,
                    args: [member.account.id],
                })
            ).rows[0],
        ).toMatchObject({
            active: 0,
            password_hash: null,
            deleted_at: expect.any(String),
            email: `deleted+${member.account.id}@invalid.local`,
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT first_name, username, email, deleted_at FROM users WHERE id = ?`,
                    args: [member.user.id],
                })
            ).rows[0],
        ).toMatchObject({
            first_name: "Deleted",
            username: `deleted_${member.user.id}`,
            email: null,
            deleted_at: expect.any(String),
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT c.owner_user_id, cm.role
                            FROM chats c JOIN chat_members cm
                              ON cm.chat_id = c.id AND cm.user_id = ?
                           WHERE c.id = ?`,
                    args: [admin.user.id, chatId],
                })
            ).rows[0],
        ).toMatchObject({ owner_user_id: admin.user.id, role: "owner" });
    });

    it("manages safe export artifacts, backup records, retention runs, and paged audit history", async () => {
        const requested = await repository.requestDataExport({
            actorUserId: member.user.id,
            kind: "user_data",
            options: { includeFiles: true },
        });
        expect(requested).toMatchObject({
            kind: "user_data",
            targetId: member.user.id,
            status: "pending",
        });
        await repository.updateDataExport({
            actorUserId: admin.user.id,
            jobId: requested.id,
            status: "running",
        });
        const output: StoredFile = {
            id: "export-artifact",
            userId: admin.user.id,
            uploadedByUserId: admin.user.id,
            isPublic: false,
            storageName: "export-artifact.zip",
            contentType: "application/zip",
            size: 512,
            width: 0,
            height: 0,
            thumbhash: "",
            kind: "file",
            originalName: "happy2-export.zip",
        };
        await database.createFile(output);
        const complete = await repository.updateDataExport({
            actorUserId: admin.user.id,
            jobId: requested.id,
            status: "complete",
            outputFileId: output.id,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        expect(complete).toMatchObject({ status: "complete", outputFileId: output.id });
        expect(complete).not.toHaveProperty("storageKey");
        const artifactGrant = await raw.execute({
            sql: `SELECT principal_id, expires_at FROM file_access_grants
                   WHERE file_id = ? AND principal_type = 'user'`,
            args: [output.id],
        });
        expect(artifactGrant.rows[0]?.principal_id).toBe(member.user.id);
        expect(artifactGrant.rows[0]?.expires_at).toBe(complete.expiresAt);

        const backup = await repository.createBackup({
            actorUserId: admin.user.id,
            storageProvider: "local",
            storageKey: "backups/server-2026-07-12.db",
            metadata: { encrypted: true },
        });
        await repository.updateBackup({
            actorUserId: admin.user.id,
            backupId: backup.id,
            status: "running",
        });
        const completedBackup = await repository.updateBackup({
            actorUserId: admin.user.id,
            backupId: backup.id,
            status: "complete",
            checksumSha256: "a".repeat(64),
            size: 1_024,
        });
        expect(completedBackup).toMatchObject({ status: "complete", size: 1_024 });

        const run = await repository.startRetentionRun({
            actorUserId: admin.user.id,
            scope: "audit",
            details: { cutoffDays: 365 },
        });
        const finished = await repository.finishRetentionRun({
            actorUserId: admin.user.id,
            runId: run.id,
            status: "complete",
            itemsExamined: 80,
            itemsDeleted: 12,
        });
        expect(finished).toMatchObject({ status: "complete", itemsExamined: 80, itemsDeleted: 12 });

        const firstPage = await repository.listAuditLog({ actorUserId: admin.user.id, limit: 2 });
        expect(firstPage.items).toHaveLength(2);
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        const secondPage = await repository.listAuditLog({
            actorUserId: admin.user.id,
            before: firstPage.nextCursor,
            limit: 2,
        });
        expect(secondPage.items).toHaveLength(2);
        expect(secondPage.items.map((item) => item.id)).not.toEqual(
            firstPage.items.map((item) => item.id),
        );
    });

    it("keeps access telemetry admin-only", async () => {
        await database.createSession(member.account.id, new Date(Date.now() + 60_000), {
            ip: "192.0.2.44",
            device: "MacBookPro",
            appVersion: "4.0.0",
            userAgent: "happy2/4.0.0",
        });
        await expect(
            repository.listUserAccess({ actorUserId: member.user.id, limit: 20 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        const telemetry = await repository.listUserAccess({
            actorUserId: admin.user.id,
            limit: 20,
        });
        expect(telemetry.items.find((item) => item.userId === member.user.id)).toMatchObject({
            email: "member@example.com",
            activeSessionCount: 1,
            lastClientIp: "192.0.2.44",
            lastDevice: "MacBookPro",
        });
        const firstPage = await repository.listUserAccess({
            actorUserId: admin.user.id,
            limit: 1,
        });
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        const secondPage = await repository.listUserAccess({
            actorUserId: admin.user.id,
            before: firstPage.nextCursor,
            limit: 1,
        });
        expect(secondPage.items).toHaveLength(1);
        expect(secondPage.items[0]?.userId).not.toBe(firstPage.items[0]?.userId);
    });

    it("does not close a shared extension client", async () => {
        const sharedRepository = new OperationsRepository(raw);
        sharedRepository.close();
        await expect(raw.execute("SELECT 1 AS alive")).resolves.toMatchObject({
            rows: [{ alive: 1 }],
        });
    });
});

async function createChat(
    client: Client,
    adminUserId: string,
    memberUserId: string,
    ownerUserId: string,
): Promise<string> {
    const chatId = createId();
    await client.execute({
        sql: `INSERT INTO chats
                (id, kind, name, slug, created_by_user_id, owner_user_id, visibility)
              VALUES (?, 'private_channel', 'Moderation', ?, ?, ?, 'private')`,
        args: [chatId, `moderation-${chatId}`, adminUserId, ownerUserId],
    });
    for (const userId of [adminUserId, memberUserId])
        await client.execute({
            sql: `INSERT INTO chat_members (chat_id, user_id, role, membership_epoch)
                  VALUES (?, ?, ?, ?)`,
            args: [chatId, userId, userId === ownerUserId ? "owner" : "member", createId()],
        });
    return chatId;
}

async function createUser(
    database: Database,
    email: string,
    username: string,
    firstName: string,
): Promise<TestIdentity> {
    const account = await database.createPasswordAccount(email, "not-used-in-this-test");
    const user = await database.createProfile(
        account.id,
        { firstName, username, email },
        { provisioned: true },
    );
    return { account, user };
}
