import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("operations control-plane lifecycle and privacy", () => {
    it("keeps reports, exports, backups, retention runs, and audit records authorized and durable", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            email: "control-admin@example.com",
            username: "control_admin",
        });
        const reviewer = await server.createUser({
            email: "control-reviewer@example.com",
            username: "control_reviewer",
        });
        const member = await server.createUser({
            email: "control-member@example.com",
            username: "control_member",
        });
        const outsider = await server.createUser({
            email: "control-outsider@example.com",
            username: "control_outsider",
        });
        const asAdmin = server.as(admin);
        const asReviewer = server.as(reviewer);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);

        expect(
            (
                await asAdmin.post(`/v0/admin/users/${reviewer.id}/updateUser`, {
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);

        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Control Plane",
            slug: "control-plane",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        expect(
            (
                await asMember.post("/v0/admin/sendAutomatedMessage", {
                    chatId,
                    text: "members cannot impersonate server automation",
                })
            ).statusCode,
        ).toBe(403);
        const automated = await asAdmin.post("/v0/admin/sendAutomatedMessage", {
            chatId,
            text: "Control-plane notice",
            clientMutationId: "control-plane-notice-v1",
        });
        expect(automated.statusCode).toBe(201);
        expect(automated.json().message).toMatchObject({
            kind: "automated",
            text: "Control-plane notice",
        });
        expect((await asMember.get(`/v0/chats/${chatId}/messages`)).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "automated", text: "Control-plane notice" }),
            ]),
        );
        expect((await asOutsider.get(`/v0/chats/${chatId}/messages`)).statusCode).toBe(404);

        const firstReport = await asMember.post("/v0/reports/createReport", {
            targetUserId: outsider.id,
            reason: "First review item",
            details: "A report that should be assigned to another administrator.",
        });
        const secondReport = await asMember.post("/v0/reports/createReport", {
            targetUserId: admin.id,
            reason: "Second review item",
        });
        expect(firstReport.statusCode).toBe(201);
        expect(secondReport.statusCode).toBe(201);
        const firstReportId = firstReport.json().report.id as string;
        const secondReportId = secondReport.json().report.id as string;

        expect((await asMember.get("/v0/admin/reports")).statusCode).toBe(403);
        expect(
            (
                await asMember.post(`/v0/admin/reports/${firstReportId}/updateReport`, {
                    status: "reviewing",
                })
            ).statusCode,
        ).toBe(403);
        const firstReportPage = await asAdmin.get("/v0/admin/reports?status=open&limit=1");
        expect(firstReportPage.statusCode).toBe(200);
        expect(firstReportPage.json().reports).toHaveLength(1);
        expect(firstReportPage.json().nextCursor).toEqual(expect.any(String));
        const secondReportPage = await asAdmin.get(
            `/v0/admin/reports?status=open&limit=1&before=${encodeURIComponent(firstReportPage.json().nextCursor as string)}`,
        );
        expect(secondReportPage.statusCode).toBe(200);
        expect(secondReportPage.json().reports).toHaveLength(1);
        expect(secondReportPage.json().reports[0].id).not.toBe(
            firstReportPage.json().reports[0].id,
        );

        const assigned = await asAdmin.post(`/v0/admin/reports/${firstReportId}/updateReport`, {
            status: "reviewing",
            assignedToUserId: reviewer.id,
            resolution: "Reviewer is investigating.",
        });
        expect(assigned.statusCode).toBe(200);
        expect(assigned.json().report).toMatchObject({
            id: firstReportId,
            status: "reviewing",
            assignedToUserId: reviewer.id,
            resolution: "Reviewer is investigating.",
        });
        const assignedReports = await asAdmin.get(
            `/v0/admin/reports?status=reviewing&assignedToUserId=${reviewer.id}&limit=20`,
        );
        expect(assignedReports.statusCode).toBe(200);
        expect(assignedReports.json().reports).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: firstReportId })]),
        );
        expect(
            (
                await asAdmin.post(`/v0/admin/reports/${firstReportId}/updateReport`, {
                    assignedToUserId: member.id,
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (await asAdmin.post(`/v0/admin/reports/${firstReportId}/updateReport`, {})).statusCode,
        ).toBe(400);
        const reopened = await asAdmin.post(`/v0/admin/reports/${firstReportId}/updateReport`, {
            status: "open",
            assignedToUserId: null,
            resolution: null,
        });
        expect(reopened.statusCode).toBe(200);
        expect(reopened.json().report).toMatchObject({ id: firstReportId, status: "open" });
        expect(reopened.json().report).not.toHaveProperty("assignedToUserId");
        expect(reopened.json().report).not.toHaveProperty("resolution");

        expect(
            (await asOutsider.post("/v0/dataExports/requestChatExport", { chatId })).statusCode,
        ).toBe(404);
        const chatExport = await asMember.post("/v0/dataExports/requestChatExport", {
            chatId,
            options: { includeThreads: true },
        });
        const ownExport = await asMember.post("/v0/me/requestDataExport", {
            options: { includeFiles: false },
        });
        expect(chatExport.statusCode).toBe(202);
        expect(ownExport.statusCode).toBe(202);
        const chatExportId = chatExport.json().dataExport.id as string;
        const ownExportId = ownExport.json().dataExport.id as string;
        expect(chatExport.json().dataExport).toMatchObject({
            requestedByUserId: member.id,
            kind: "chat_history",
            targetId: chatId,
            status: "pending",
        });
        expect((await asOutsider.get(`/v0/dataExports/${chatExportId}`)).statusCode).toBe(404);
        expect(
            (await asOutsider.post(`/v0/dataExports/${chatExportId}/cancelDataExport`, {}))
                .statusCode,
        ).toBe(404);
        const ownExportPage = await asMember.get("/v0/dataExports?status=pending&limit=1");
        expect(ownExportPage.statusCode).toBe(200);
        expect(ownExportPage.json().dataExports).toHaveLength(1);
        expect(ownExportPage.json().nextCursor).toEqual(expect.any(String));
        const ownExportNextPage = await asMember.get(
            `/v0/dataExports?status=pending&limit=1&before=${encodeURIComponent(ownExportPage.json().nextCursor as string)}`,
        );
        expect(ownExportNextPage.statusCode).toBe(200);
        expect(ownExportNextPage.json().dataExports).toHaveLength(1);
        expect(ownExportNextPage.json().dataExports[0].id).not.toBe(
            ownExportPage.json().dataExports[0].id,
        );
        expect((await asMember.get("/v0/admin/dataExports")).statusCode).toBe(403);
        expect(
            (
                await asMember.post("/v0/admin/requestDataExport", {
                    kind: "server_data",
                })
            ).statusCode,
        ).toBe(403);
        const memberExports = await asAdmin.get(
            `/v0/admin/dataExports?requestedByUserId=${member.id}&status=pending&limit=20`,
        );
        expect(memberExports.statusCode).toBe(200);
        expect(memberExports.json().dataExports.map((item: { id: string }) => item.id)).toEqual(
            expect.arrayContaining([chatExportId, ownExportId]),
        );

        const adminUserExport = await asAdmin.post("/v0/admin/requestDataExport", {
            kind: "user_data",
            targetId: member.id,
            options: { requestedBy: "support" },
        });
        const serverExport = await asAdmin.post("/v0/admin/requestDataExport", {
            kind: "server_data",
        });
        expect(adminUserExport.statusCode).toBe(202);
        expect(serverExport.statusCode).toBe(202);
        const adminUserExportId = adminUserExport.json().dataExport.id as string;
        expect((await asMember.get(`/v0/dataExports/${adminUserExportId}`)).statusCode).toBe(404);
        expect((await asAdmin.get(`/v0/dataExports/${adminUserExportId}`)).statusCode).toBe(200);
        expect(
            (
                await asMember.post(`/v0/admin/dataExports/${chatExportId}/updateDataExport`, {
                    status: "running",
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await asAdmin.post(`/v0/admin/dataExports/${chatExportId}/updateDataExport`, {
                    status: "complete",
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asAdmin.post(`/v0/admin/dataExports/${chatExportId}/updateDataExport`, {
                    status: "running",
                })
            ).statusCode,
        ).toBe(200);
        const outputFileId = await uploadTextFile(asAdmin, "member-export.txt", "member export");
        const completedExport = await asAdmin.post(
            `/v0/admin/dataExports/${chatExportId}/updateDataExport`,
            { status: "complete", outputFileId },
        );
        expect(completedExport.statusCode).toBe(200);
        expect(completedExport.json().dataExport).toMatchObject({
            id: chatExportId,
            status: "complete",
            outputFileId,
        });
        expect((await asMember.get(`/v0/files/${outputFileId}`)).statusCode).toBe(200);
        expect((await asOutsider.get(`/v0/files/${outputFileId}`)).statusCode).toBe(404);
        expect(
            (await asMember.post(`/v0/dataExports/${chatExportId}/cancelDataExport`, {}))
                .statusCode,
        ).toBe(409);
        expect(
            (await asMember.post(`/v0/dataExports/${ownExportId}/cancelDataExport`, {})).statusCode,
        ).toBe(200);

        expect((await asMember.get("/v0/admin/backups")).statusCode).toBe(403);
        expect(
            (
                await asMember.post("/v0/admin/backups/createBackupRecord", {
                    storageProvider: "s3",
                    storageKey: "control/member-forbidden.sqlite3",
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await asAdmin.post("/v0/admin/backups/createBackupRecord", {
                    storageProvider: "s3",
                    storageKey: "../outside.sqlite3",
                })
            ).statusCode,
        ).toBe(400);
        const firstBackup = await asAdmin.post("/v0/admin/backups/createBackupRecord", {
            storageProvider: "s3",
            storageKey: "control/first.sqlite3",
            metadata: { purpose: "first" },
        });
        const secondBackup = await asAdmin.post("/v0/admin/backups/createBackupRecord", {
            storageProvider: "local",
            storageKey: "control/second.sqlite3",
        });
        expect(firstBackup.statusCode).toBe(201);
        expect(secondBackup.statusCode).toBe(201);
        const firstBackupId = firstBackup.json().backup.id as string;
        const secondBackupId = secondBackup.json().backup.id as string;
        const pendingBackups = await asAdmin.get("/v0/admin/backups?status=pending&limit=1");
        expect(pendingBackups.statusCode).toBe(200);
        expect(pendingBackups.json().backups).toHaveLength(1);
        expect(pendingBackups.json().nextCursor).toEqual(expect.any(String));
        const nextPendingBackups = await asAdmin.get(
            `/v0/admin/backups?status=pending&limit=1&before=${encodeURIComponent(pendingBackups.json().nextCursor as string)}`,
        );
        expect(nextPendingBackups.statusCode).toBe(200);
        expect(nextPendingBackups.json().backups).toHaveLength(1);
        expect(nextPendingBackups.json().backups[0].id).not.toBe(
            pendingBackups.json().backups[0].id,
        );
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${firstBackupId}/createBackupRecord`, {
                    storageProvider: "s3",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asAdmin.post("/v0/admin/backups/createBackupRecord", {
                    storageProvider: "s3",
                    storageKey: "control/first.sqlite3",
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${firstBackupId}/updateBackupRecord`, {
                    status: "complete",
                    checksumSha256: "a".repeat(64),
                    size: 1,
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${firstBackupId}/updateBackupRecord`, {
                    status: "running",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${firstBackupId}/updateBackupRecord`, {
                    status: "complete",
                })
            ).statusCode,
        ).toBe(400);
        const completeBackup = await asAdmin.post(
            `/v0/admin/backups/${firstBackupId}/updateBackupRecord`,
            {
                status: "complete",
                checksumSha256: "a".repeat(64),
                size: 1,
                metadata: { verified: true },
            },
        );
        expect(completeBackup.statusCode).toBe(200);
        expect(completeBackup.json().backup).toMatchObject({
            id: firstBackupId,
            status: "complete",
            checksumSha256: "a".repeat(64),
            size: 1,
            metadata: { verified: true },
        });
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${firstBackupId}/updateBackupRecord`, {
                    status: "running",
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${secondBackupId}/updateBackupRecord`, {
                    status: "failed",
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asAdmin.post(`/v0/admin/backups/${secondBackupId}/updateBackupRecord`, {
                    status: "failed",
                    lastError: "storage unavailable",
                })
            ).statusCode,
        ).toBe(200);
        const completeBackups = await asAdmin.get("/v0/admin/backups?status=complete&limit=20");
        expect(completeBackups.statusCode).toBe(200);
        expect(completeBackups.json().backups).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: firstBackupId })]),
        );

        expect((await asMember.get("/v0/admin/retentionRuns")).statusCode).toBe(403);
        expect(
            (
                await asMember.post("/v0/admin/retentionRuns/startRetentionRun", {
                    scope: "messages",
                })
            ).statusCode,
        ).toBe(403);
        const messageRetention = await asAdmin.post("/v0/admin/retentionRuns/startRetentionRun", {
            scope: "messages",
            details: { dryRun: true },
        });
        const fileRetention = await asAdmin.post("/v0/admin/retentionRuns/startRetentionRun", {
            scope: "files",
        });
        expect(messageRetention.statusCode).toBe(201);
        expect(fileRetention.statusCode).toBe(201);
        const messageRetentionId = messageRetention.json().retentionRun.id as string;
        const fileRetentionId = fileRetention.json().retentionRun.id as string;
        expect(
            (
                await asAdmin.post("/v0/admin/retentionRuns/startRetentionRun", {
                    scope: "messages",
                })
            ).statusCode,
        ).toBe(409);
        const retentionPage = await asAdmin.get("/v0/admin/retentionRuns?limit=1");
        expect(retentionPage.statusCode).toBe(200);
        expect(retentionPage.json().retentionRuns).toHaveLength(1);
        expect(retentionPage.json().nextCursor).toEqual(expect.any(String));
        const retentionNextPage = await asAdmin.get(
            `/v0/admin/retentionRuns?limit=1&before=${encodeURIComponent(retentionPage.json().nextCursor as string)}`,
        );
        expect(retentionNextPage.statusCode).toBe(200);
        expect(retentionNextPage.json().retentionRuns).toHaveLength(1);
        expect(retentionNextPage.json().retentionRuns[0].id).not.toBe(
            retentionPage.json().retentionRuns[0].id,
        );
        expect(
            (
                await asAdmin.post(
                    `/v0/admin/retentionRuns/${messageRetentionId}/finishRetentionRun`,
                    {
                        status: "failed",
                        itemsExamined: 0,
                        itemsDeleted: 0,
                    },
                )
            ).statusCode,
        ).toBe(400);
        const completedRetention = await asAdmin.post(
            `/v0/admin/retentionRuns/${messageRetentionId}/finishRetentionRun`,
            {
                status: "complete",
                itemsExamined: 12,
                itemsDeleted: 3,
                details: { dryRun: false },
            },
        );
        expect(completedRetention.statusCode).toBe(200);
        expect(completedRetention.json().retentionRun).toMatchObject({
            id: messageRetentionId,
            status: "complete",
            itemsExamined: 12,
            itemsDeleted: 3,
        });
        expect(
            (
                await asAdmin.post(
                    `/v0/admin/retentionRuns/${messageRetentionId}/finishRetentionRun`,
                    {
                        status: "complete",
                        itemsExamined: 12,
                        itemsDeleted: 3,
                    },
                )
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asAdmin.post(
                    `/v0/admin/retentionRuns/${fileRetentionId}/finishRetentionRun`,
                    {
                        status: "failed",
                        itemsExamined: 4,
                        itemsDeleted: 0,
                        lastError: "scanner unavailable",
                    },
                )
            ).statusCode,
        ).toBe(200);
        const messageRetentionRuns = await asAdmin.get(
            "/v0/admin/retentionRuns?scope=messages&limit=20",
        );
        expect(messageRetentionRuns.statusCode).toBe(200);
        expect(messageRetentionRuns.json().retentionRuns).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: messageRetentionId, status: "complete" }),
            ]),
        );

        expect((await asMember.get("/v0/admin/auditLogs")).statusCode).toBe(403);
        const auditPage = await asAdmin.get("/v0/admin/auditLogs?limit=1");
        expect(auditPage.statusCode).toBe(200);
        expect(auditPage.json().auditLogs).toHaveLength(1);
        expect(auditPage.json().nextCursor).toEqual(expect.any(String));
        const nextAuditPage = await asAdmin.get(
            `/v0/admin/auditLogs?limit=1&before=${encodeURIComponent(auditPage.json().nextCursor as string)}`,
        );
        expect(nextAuditPage.statusCode).toBe(200);
        expect(nextAuditPage.json().auditLogs).toHaveLength(1);
        expect(nextAuditPage.json().auditLogs[0].id).not.toBe(auditPage.json().auditLogs[0].id);
        const reportAudit = await asAdmin.get(
            `/v0/admin/auditLogs?action=moderation.report_updated&targetType=moderation_report&targetId=${firstReportId}&actorUserId=${admin.id}&limit=20`,
        );
        expect(reportAudit.statusCode).toBe(200);
        expect(reportAudit.json().auditLogs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: "moderation.report_updated",
                    targetId: firstReportId,
                    actorUserId: admin.id,
                }),
            ]),
        );
        const exportAudit = await asAdmin.get(
            `/v0/admin/auditLogs?action=data_export.complete&targetType=data_export&targetId=${chatExportId}&limit=20`,
        );
        expect(exportAudit.statusCode).toBe(200);
        expect(exportAudit.json().auditLogs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ action: "data_export.complete", targetId: chatExportId }),
            ]),
        );
        const backupAudit = await asAdmin.get(
            `/v0/admin/auditLogs?targetType=backup&targetId=${firstBackupId}&limit=20`,
        );
        expect(backupAudit.statusCode).toBe(200);
        expect(
            backupAudit.json().auditLogs.map((entry: { action: string }) => entry.action),
        ).toEqual(expect.arrayContaining(["backup.created", "backup.running", "backup.complete"]));

        await server.restart();
        expect((await asMember.get(`/v0/chats/${chatId}/messages`)).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "automated", text: "Control-plane notice" }),
            ]),
        );
        expect(
            (await asMember.get(`/v0/dataExports/${chatExportId}`)).json().dataExport,
        ).toMatchObject({
            id: chatExportId,
            status: "complete",
            outputFileId,
        });
        expect((await asMember.get(`/v0/files/${outputFileId}`)).statusCode).toBe(200);
        expect(
            (await asAdmin.get("/v0/admin/backups?status=complete&limit=20")).json().backups,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: firstBackupId, status: "complete" }),
            ]),
        );
        expect(
            (await asAdmin.get("/v0/admin/retentionRuns?scope=messages&limit=20")).json()
                .retentionRuns,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: messageRetentionId, status: "complete" }),
            ]),
        );
        expect(
            (await asAdmin.get(`/v0/admin/reports?status=open&limit=20`)).json().reports,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: firstReportId }),
                expect.objectContaining({ id: secondReportId }),
            ]),
        );
        expect((await asReviewer.get("/v0/admin/reports?status=open&limit=20")).statusCode).toBe(
            200,
        );
    });
});

async function uploadTextFile(
    client: GymRequestClient,
    filename: string,
    contents: string,
): Promise<string> {
    const boundary = `gym-control-${Date.now()}`;
    const response = await client.post(
        "/v0/files/upload",
        Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`,
            ),
            Buffer.from(contents),
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
        { headers: { "content-type": `multipart/form-data; boundary=${boundary}` } },
    );
    expect(response.statusCode).toBe(201);
    return response.json().file.id as string;
}
