import { userAccessList } from "../user/userAccessList.js";
import { retentionRunStart } from "../retention/retentionRunStart.js";
import { retentionRunFinish } from "../retention/retentionRunFinish.js";
import { moderationReportUpdate } from "../moderation/moderationReportUpdate.js";
import { moderationReportList } from "../moderation/moderationReportList.js";
import { moderationReportCreate } from "../moderation/moderationReportCreate.js";
import { moderationActionTake } from "../moderation/moderationActionTake.js";
import { moderationActionRevoke } from "../moderation/moderationActionRevoke.js";
import { dataExportUpdate } from "../data-export/dataExportUpdate.js";
import { dataExportRequest } from "../data-export/dataExportRequest.js";
import { backupUpdate } from "../backup/backupUpdate.js";
import { backupCreate } from "../backup/backupCreate.js";
import { auditLogList } from "../audit/auditLogList.js";
import { accountBanRevoke } from "../moderation/accountBanRevoke.js";
import { accountBanList } from "../moderation/accountBanList.js";
import { accountBanExpireDue } from "../moderation/accountBanExpireDue.js";
import { accountBanApply } from "../moderation/accountBanApply.js";
import { userCreateProfile } from "../user/userCreateProfile.js";
import { sessionFindActive } from "../auth/sessionFindActive.js";
import { sessionCreate } from "../auth/sessionCreate.js";
import { fileCreate } from "../file/fileCreate.js";
import { accountCreatePassword } from "../auth/accountCreatePassword.js";
import { createDatabase, type DrizzleExecutor } from "../drizzle.js";
import { createClient, type Client } from "@libsql/client";

import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { createId } from "@paralleldrive/cuid2";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../auth/types.js";
import type { StoredFile } from "../file/types.js";
import type { User } from "../user/types.js";
interface TestIdentity {
    account: Account;
    user: User;
}
describe("operations actions", () => {
    let directory: string;
    let client: Client;
    let executor: DrizzleExecutor;
    let raw: Client;
    let admin: TestIdentity;
    let member: TestIdentity;
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-operations-"));
        const url = `file:${join(directory, "happy2.db")}`;
        client = createClient({
            url,
        });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        raw = createClient({
            url,
        });
        admin = await createUser(executor, "admin@example.com", "admin", "Ada");
        member = await createUser(executor, "member@example.com", "member", "Grace");
    });
    afterEach(async () => {
        raw.close();
        client.close();
        await rm(directory, {
            recursive: true,
            force: true,
        });
    });
    it("applies and revokes reasoned bans atomically with session revocation and audit telemetry", async () => {
        const session = await sessionCreate(
            executor,
            member.account.id,
            new Date(Date.now() + 60_000),
            {
                ip: "203.0.113.9",
            },
        );
        const ban = await accountBanApply(executor, {
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
        expect(await sessionFindActive(executor, session.id)).toBeUndefined();
        await expect(
            sessionCreate(executor, member.account.id, new Date(Date.now() + 60_000), {}),
        ).rejects.toThrow("not allowed");
        const audit = await auditLogList(executor, {
            actorUserId: admin.user.id,
            limit: 20,
        });
        expect(audit.items[0]).toMatchObject({
            action: "user.ban_applied",
            targetId: member.user.id,
            clientIp: "198.51.100.12",
            device: "Happy (2) Desktop",
        });
        expect(audit.items[0]?.metadata).toMatchObject({
            revokedSessionCount: 1,
        });
        const revoked = await accountBanRevoke(executor, {
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Appeal accepted",
        });
        expect(revoked).toMatchObject({
            status: "revoked",
            revokeReason: "Appeal accepted",
        });
        await expect(
            sessionCreate(executor, member.account.id, new Date(Date.now() + 60_000), {}),
        ).resolves.toMatchObject({
            accountId: member.account.id,
        });
        const history = await accountBanList(executor, {
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            limit: 20,
        });
        expect(history.items).toHaveLength(1);
    });
    it("expires elapsed bans idempotently and records a system audit entry", async () => {
        await accountBanApply(executor, {
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
        await expect(accountBanExpireDue(executor)).resolves.toBe(1);
        await expect(accountBanExpireDue(executor)).resolves.toBe(0);
        await expect(
            sessionCreate(executor, member.account.id, new Date(Date.now() + 60_000), {}),
        ).resolves.toBeDefined();
        const audit = await auditLogList(executor, {
            actorUserId: admin.user.id,
            action: "user.ban_expired",
            limit: 10,
        });
        expect(audit.items).toHaveLength(1);
        expect(audit.items[0]).toMatchObject({
            actorUserId: undefined,
            targetId: member.user.id,
        });
    });
    it("accepts privacy-checked reports and durably resolves them with moderation actions", async () => {
        const report = await moderationReportCreate(executor, {
            actorUserId: member.user.id,
            targetUserId: admin.user.id,
            reason: "Inappropriate profile content",
            details: "Please review the title.",
        });
        expect(report).toMatchObject({
            status: "open",
            reportedByUserId: member.user.id,
        });
        await expect(
            moderationReportList(executor, {
                actorUserId: member.user.id,
                limit: 20,
            }),
        ).rejects.toMatchObject({
            code: "forbidden",
        });
        const reviewing = await moderationReportUpdate(executor, {
            actorUserId: admin.user.id,
            reportId: report.id,
            status: "reviewing",
            assignedToUserId: admin.user.id,
        });
        expect(reviewing).toMatchObject({
            status: "reviewing",
            assignedToUserId: admin.user.id,
        });
        const acted = await moderationActionTake(executor, {
            actorUserId: admin.user.id,
            reportId: report.id,
            action: "warn",
            reason: "Content policy reminder sent",
            metadata: {
                template: "profile-content-v1",
            },
        });
        expect(acted.report).toMatchObject({
            status: "resolved",
        });
        expect(acted.action).toMatchObject({
            action: "warn",
            metadata: {
                template: "profile-content-v1",
            },
        });
        expect(acted.sync).toMatchObject({
            areas: ["notifications"],
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT kind, user_id, sync_sequence FROM notifications
                           WHERE user_id = ? ORDER BY created_at`,
                    args: [admin.user.id],
                })
            ).rows,
        ).toMatchObject([
            {
                kind: "moderation",
                user_id: admin.user.id,
            },
        ]);
        const restrictionReport = await moderationReportCreate(executor, {
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Repeated disruptive posting",
        });
        const restriction = await moderationActionTake(executor, {
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
        const revokedRestriction = await moderationActionRevoke(executor, {
            actorUserId: admin.user.id,
            actionId: restriction.action.id,
            reason: "Review completed",
        });
        expect(revokedRestriction.action.revokedAt).toEqual(expect.any(String));
        expect(revokedRestriction.sync).toMatchObject({
            areas: ["notifications"],
        });
        expect(
            (
                await raw.execute({
                    sql: `SELECT count(*) AS count FROM notifications WHERE user_id = ? AND kind = 'moderation'`,
                    args: [member.user.id],
                })
            ).rows[0]?.count,
        ).toBe(2);
        await expect(
            moderationActionRevoke(executor, {
                actorUserId: admin.user.id,
                actionId: restriction.action.id,
            }),
        ).rejects.toMatchObject({
            code: "conflict",
        });
        const queue = await moderationReportList(executor, {
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
        const messageReport = await moderationReportCreate(executor, {
            actorUserId: admin.user.id,
            chatId,
            messageId: removedMessageId,
            reason: "Abusive message",
        });
        const removedMessage = await moderationActionTake(executor, {
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
        expect(removedMessage.sync?.chats).toEqual([
            {
                chatId,
                pts: "3",
            },
        ]);
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
        await fileCreate(executor, file);
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
        const fileReport = await moderationReportCreate(executor, {
            actorUserId: admin.user.id,
            chatId,
            fileId: file.id,
            reason: "Unsafe attachment",
        });
        const removedFile = await moderationActionTake(executor, {
            actorUserId: admin.user.id,
            reportId: fileReport.id,
            action: "remove_file",
            reason: "Quarantined by moderation",
        });
        expect(removedFile.action).toMatchObject({
            action: "remove_file",
            fileId: file.id,
        });
        expect(removedFile.sync).toMatchObject({
            chats: [
                {
                    chatId,
                    pts: "4",
                },
            ],
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
    it("moderates a message in a child chat without mutating the parent timeline", async () => {
        const parentChatId = await createChat(raw, admin.user.id, member.user.id, admin.user.id);
        const childChatId = createId();
        const removedReplyId = createId();
        await raw.batch([
            {
                sql: `INSERT INTO chats
                        (id, kind, name, parent_chat_id, created_by_user_id, owner_user_id,
                         pts, last_message_sequence, last_change_sequence, is_listed)
                      VALUES (?, 'private_channel', 'Moderated child', ?, ?, ?, 1, 1, 1, 0)`,
                args: [childChatId, parentChatId, admin.user.id, admin.user.id],
            },
            {
                sql: `INSERT INTO chat_members
                        (chat_id, user_id, role, membership_epoch)
                      VALUES (?, ?, 'owner', ?), (?, ?, 'member', ?)`,
                args: [
                    childChatId,
                    admin.user.id,
                    createId(),
                    childChatId,
                    member.user.id,
                    createId(),
                ],
            },
            {
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, text)
                      VALUES (?, ?, 1, 1, ?, 'removed child reply')`,
                args: [removedReplyId, childChatId, member.user.id],
            },
            {
                sql: `UPDATE chats SET pts = 1, last_message_sequence = 1,
                             last_change_sequence = 1 WHERE id = ?`,
                args: [parentChatId],
            },
        ]);
        const report = await moderationReportCreate(executor, {
            actorUserId: admin.user.id,
            chatId: childChatId,
            messageId: removedReplyId,
            reason: "Child-chat reply violates policy",
        });
        const removed = await moderationActionTake(executor, {
            actorUserId: admin.user.id,
            reportId: report.id,
            action: "remove_message",
        });
        expect(removed.sync?.chats).toEqual([
            {
                chatId: childChatId,
                pts: "2",
            },
        ]);
        expect(
            (
                await raw.execute({
                    sql: `SELECT deleted_at, change_pts FROM messages WHERE id = ?`,
                    args: [removedReplyId],
                })
            ).rows[0],
        ).toMatchObject({
            deleted_at: expect.any(String),
            change_pts: 2,
        });
    });
    it("deletes users by revoking sessions, anonymizing identity, and transferring ownership", async () => {
        const chatId = await createChat(raw, admin.user.id, member.user.id, member.user.id);
        const session = await sessionCreate(
            executor,
            member.account.id,
            new Date(Date.now() + 60_000),
            {},
        );
        const report = await moderationReportCreate(executor, {
            actorUserId: admin.user.id,
            targetUserId: member.user.id,
            reason: "Account removal required",
        });
        const deleted = await moderationActionTake(executor, {
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
            chats: expect.arrayContaining([
                {
                    chatId,
                    pts: "1",
                },
            ]),
            areas: ["users"],
        });
        expect(await sessionFindActive(executor, session.id)).toBeUndefined();
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
        ).toMatchObject({
            owner_user_id: admin.user.id,
            role: "owner",
        });
    });
    it("manages safe export artifacts, backup records, retention runs, and paged audit history", async () => {
        const requested = await dataExportRequest(executor, {
            actorUserId: member.user.id,
            kind: "user_data",
            options: {
                includeFiles: true,
            },
        });
        expect(requested).toMatchObject({
            kind: "user_data",
            targetId: member.user.id,
            status: "pending",
        });
        await dataExportUpdate(executor, {
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
        await fileCreate(executor, output);
        const complete = await dataExportUpdate(executor, {
            actorUserId: admin.user.id,
            jobId: requested.id,
            status: "complete",
            outputFileId: output.id,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        expect(complete).toMatchObject({
            status: "complete",
            outputFileId: output.id,
        });
        expect(complete).not.toHaveProperty("storageKey");
        const artifactGrant = await raw.execute({
            sql: `SELECT principal_id, expires_at FROM file_access_grants
                   WHERE file_id = ? AND principal_type = 'user'`,
            args: [output.id],
        });
        expect(artifactGrant.rows[0]?.principal_id).toBe(member.user.id);
        expect(artifactGrant.rows[0]?.expires_at).toBe(complete.expiresAt);
        const backup = await backupCreate(executor, {
            actorUserId: admin.user.id,
            storageProvider: "local",
            storageKey: "backups/server-2026-07-12.db",
            metadata: {
                encrypted: true,
            },
        });
        await backupUpdate(executor, {
            actorUserId: admin.user.id,
            backupId: backup.id,
            status: "running",
        });
        const completedBackup = await backupUpdate(executor, {
            actorUserId: admin.user.id,
            backupId: backup.id,
            status: "complete",
            checksumSha256: "a".repeat(64),
            size: 1_024,
        });
        expect(completedBackup).toMatchObject({
            status: "complete",
            size: 1_024,
        });
        const run = await retentionRunStart(executor, {
            actorUserId: admin.user.id,
            scope: "audit",
            details: {
                cutoffDays: 365,
            },
        });
        const finished = await retentionRunFinish(executor, {
            actorUserId: admin.user.id,
            runId: run.id,
            status: "complete",
            itemsExamined: 80,
            itemsDeleted: 12,
        });
        expect(finished).toMatchObject({
            status: "complete",
            itemsExamined: 80,
            itemsDeleted: 12,
        });
        const firstPage = await auditLogList(executor, {
            actorUserId: admin.user.id,
            limit: 2,
        });
        expect(firstPage.items).toHaveLength(2);
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        const secondPage = await auditLogList(executor, {
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
        await sessionCreate(executor, member.account.id, new Date(Date.now() + 60_000), {
            ip: "192.0.2.44",
            device: "MacBookPro",
            appVersion: "4.0.0",
            userAgent: "happy2/4.0.0",
        });
        await expect(
            userAccessList(executor, {
                actorUserId: member.user.id,
                limit: 20,
            }),
        ).rejects.toMatchObject({
            code: "forbidden",
        });
        const telemetry = await userAccessList(executor, {
            actorUserId: admin.user.id,
            limit: 20,
        });
        expect(telemetry.items.find((item) => item.userId === member.user.id)).toMatchObject({
            email: "member@example.com",
            activeSessionCount: 1,
            lastClientIp: "192.0.2.44",
            lastDevice: "MacBookPro",
        });
        const firstPage = await userAccessList(executor, {
            actorUserId: admin.user.id,
            limit: 1,
        });
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        const secondPage = await userAccessList(executor, {
            actorUserId: admin.user.id,
            before: firstPage.nextCursor,
            limit: 1,
        });
        expect(secondPage.items).toHaveLength(1);
        expect(secondPage.items[0]?.userId).not.toBe(firstPage.items[0]?.userId);
    });
    it("does not own or close the executor's shared client", async () => {
        const sharedExecutor = createDatabase(raw);
        await auditLogList(sharedExecutor, { actorUserId: admin.user.id, limit: 1 });
        await expect(raw.execute("SELECT 1 AS alive")).resolves.toMatchObject({
            rows: [
                {
                    alive: 1,
                },
            ],
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
    executor: DrizzleExecutor,
    email: string,
    username: string,
    firstName: string,
): Promise<TestIdentity> {
    const account = await accountCreatePassword(executor, email, "not-used-in-this-test");
    const user = await userCreateProfile(
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
    return {
        account,
        user,
    };
}
