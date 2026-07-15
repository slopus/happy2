import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("administrative operations HTTP API", () => {
    it("audits reports, exports, backups, retention, access, and ban lifecycles", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            email: "operations-admin@example.com",
            username: "operations_admin",
            firstName: "Admin",
        });
        const member = await server.createUser({
            email: "operations-member@example.com",
            username: "operations_member",
            firstName: "Member",
        });
        const expiringMember = await server.createUser({
            email: "expiring-member@example.com",
            username: "expiring_member",
            firstName: "Expiring",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const asExpiringMember = server.as(expiringMember);

        expect((await asMember.get("/v0/admin/auditLogs")).statusCode).toBe(403);
        expect((await server.get("/v0/admin/auditLogs")).statusCode).toBe(401);

        const touched = await asMember.get("/v0/me");
        expect(touched.statusCode).toBe(200);
        const accessBeforeBan = await asAdmin.get("/v0/admin/userAccess?limit=20");
        expect(accessBeforeBan.statusCode).toBe(200);
        expect(
            accessBeforeBan
                .json()
                .users.find((user: { userId: string }) => user.userId === member.id),
        ).toMatchObject({
            username: member.username,
            activeSessionCount: 1,
        });
        const firstAccessPage = await asAdmin.get("/v0/admin/userAccess?limit=1");
        expect(firstAccessPage.statusCode).toBe(200);
        expect(firstAccessPage.json().users).toHaveLength(1);
        expect(firstAccessPage.json().nextCursor).toEqual(expect.any(String));
        const secondAccessPage = await asAdmin.get(
            `/v0/admin/userAccess?limit=1&before=${encodeURIComponent(firstAccessPage.json().nextCursor)}`,
        );
        expect(secondAccessPage.statusCode).toBe(200);
        expect(secondAccessPage.json().users).toHaveLength(1);
        expect(secondAccessPage.json().users[0].userId).not.toBe(
            firstAccessPage.json().users[0].userId,
        );

        const reportResponse = await asMember.post(
            "/v0/reports/createReport",
            {
                targetUserId: expiringMember.id,
                reason: "Profile impersonation concern",
                details: "Please verify this account.",
            },
            {
                headers: {
                    "x-happy2-device": "Happy (2) Desktop",
                    "user-agent": "happy2-gym/operations",
                },
            },
        );
        expect(reportResponse.statusCode).toBe(201);
        const reportId = reportResponse.json().report.id as string;

        const openReports = await asAdmin.get("/v0/admin/reports?status=open&limit=20");
        expect(openReports.statusCode).toBe(200);
        expect(openReports.json().reports).toContainEqual(
            expect.objectContaining({
                id: reportId,
                reportedByUserId: member.id,
                targetUserId: expiringMember.id,
                status: "open",
            }),
        );
        const reviewed = await asAdmin.post(`/v0/admin/reports/${reportId}/takeAction`, {
            action: "warn",
            reason: "Identity was verified; warning recorded",
            metadata: { policy: "identity" },
        });
        expect(reviewed.statusCode).toBe(200);
        expect(reviewed.json()).toMatchObject({
            report: { id: reportId, status: "resolved", assignedToUserId: admin.id },
            action: { action: "warn", targetUserId: expiringMember.id },
        });

        const exportResponse = await asMember.post("/v0/me/requestDataExport", {
            options: { includeFiles: true },
        });
        expect(exportResponse.statusCode).toBe(202);
        const exportId = exportResponse.json().dataExport.id as string;
        expect(exportResponse.json().dataExport).toMatchObject({
            requestedByUserId: member.id,
            targetId: member.id,
            kind: "user_data",
            status: "pending",
        });
        expect((await asExpiringMember.get(`/v0/dataExports/${exportId}`)).statusCode).toBe(404);
        const ownExports = await asMember.get("/v0/dataExports?status=pending");
        expect(ownExports.json().dataExports.map((job: { id: string }) => job.id)).toContain(
            exportId,
        );
        const cancelledExport = await asMember.post(
            `/v0/dataExports/${exportId}/cancelDataExport`,
            {},
        );
        expect(cancelledExport.statusCode).toBe(200);
        expect(cancelledExport.json().dataExport).toMatchObject({
            id: exportId,
            status: "cancelled",
        });

        const backupResponse = await asAdmin.post("/v0/admin/backups/createBackupRecord", {
            storageProvider: "s3",
            storageKey: "gym/server-backup.sqlite3",
            metadata: { region: "test" },
        });
        expect(backupResponse.statusCode).toBe(201);
        const backupId = backupResponse.json().backup.id as string;
        const runningBackup = await asAdmin.post(
            `/v0/admin/backups/${backupId}/updateBackupRecord`,
            { status: "running" },
        );
        expect(runningBackup.statusCode).toBe(200);
        const completedBackup = await asAdmin.post(
            `/v0/admin/backups/${backupId}/updateBackupRecord`,
            {
                status: "complete",
                checksumSha256: "a".repeat(64),
                size: 4_096,
            },
        );
        expect(completedBackup.statusCode).toBe(200);
        expect(completedBackup.json().backup).toMatchObject({
            id: backupId,
            status: "complete",
            checksumSha256: "a".repeat(64),
            size: 4_096,
        });
        expect((await asMember.get("/v0/admin/backups")).statusCode).toBe(403);

        const retentionResponse = await asAdmin.post("/v0/admin/retentionRuns/startRetentionRun", {
            scope: "audit",
            details: { cutoffDays: 365 },
        });
        expect(retentionResponse.statusCode).toBe(201);
        const retentionId = retentionResponse.json().retentionRun.id as string;
        const finishedRetention = await asAdmin.post(
            `/v0/admin/retentionRuns/${retentionId}/finishRetentionRun`,
            {
                status: "complete",
                itemsExamined: 12,
                itemsDeleted: 3,
                details: { dryRun: false },
            },
        );
        expect(finishedRetention.statusCode).toBe(200);
        expect(finishedRetention.json().retentionRun).toMatchObject({
            id: retentionId,
            scope: "audit",
            status: "complete",
            itemsExamined: 12,
            itemsDeleted: 3,
        });

        const permanentBan = await asAdmin.post(`/v0/admin/users/${member.id}/applyBan`, {
            reason: "Manual access review",
        });
        expect(permanentBan.statusCode).toBe(201);
        expect(permanentBan.json().ban).toMatchObject({
            userId: member.id,
            reason: "Manual access review",
            status: "active",
        });
        expect((await asMember.get("/v0/me")).statusCode).toBe(401);
        const revokedBan = await asAdmin.post(`/v0/admin/users/${member.id}/revokeBan`, {
            reason: "Review completed",
        });
        expect(revokedBan.statusCode).toBe(200);
        expect(revokedBan.json().ban).toMatchObject({
            userId: member.id,
            status: "revoked",
            revokeReason: "Review completed",
        });

        const expiresAt = new Date(Date.now() + 500).toISOString();
        const expiringBan = await asAdmin.post(`/v0/admin/users/${expiringMember.id}/applyBan`, {
            reason: "Short cooling-off period",
            expiresAt,
        });
        expect(expiringBan.statusCode).toBe(201);
        expect(expiringBan.json().ban).toMatchObject({
            userId: expiringMember.id,
            expiresAt,
            status: "active",
        });
        await waitUntil(Date.parse(expiresAt));
        const expired = await asAdmin.post("/v0/admin/expireBans", {});
        expect(expired.statusCode).toBe(200);
        expect([0, 1]).toContain(expired.json().expired);

        const banHistory = await asAdmin.get("/v0/admin/bans?status=revoked&limit=20");
        expect(banHistory.statusCode).toBe(200);
        expect(banHistory.json().bans).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    userId: member.id,
                    status: "revoked",
                    revokeReason: "Review completed",
                }),
                expect.objectContaining({
                    userId: expiringMember.id,
                    status: "revoked",
                    revokeReason: "expired",
                }),
            ]),
        );

        const accessAfterBans = await asAdmin.get("/v0/admin/userAccess?limit=20");
        expect(accessAfterBans.statusCode).toBe(200);
        for (const userId of [member.id, expiringMember.id]) {
            expect(
                accessAfterBans
                    .json()
                    .users.find((user: { userId: string }) => user.userId === userId),
            ).toMatchObject({ userId, activeSessionCount: 0 });
        }

        const auditResponse = await asAdmin.get("/v0/admin/auditLogs?limit=200");
        expect(auditResponse.statusCode).toBe(200);
        const auditLogs = auditResponse.json().auditLogs as Array<{
            action: string;
            actorUserId?: string;
            targetId?: string;
            device?: string;
            userAgent?: string;
        }>;
        expect(auditLogs.map((entry) => entry.action)).toEqual(
            expect.arrayContaining([
                "moderation.report_created",
                "moderation.warn",
                "data_export.requested",
                "data_export.cancelled",
                "backup.created",
                "backup.running",
                "backup.complete",
                "retention.started",
                "retention.complete",
                "user.ban_applied",
                "user.ban_revoked",
                "user.ban_expired",
            ]),
        );
        expect(
            auditLogs.find((entry) => entry.action === "moderation.report_created"),
        ).toMatchObject({
            actorUserId: member.id,
            targetId: reportId,
            device: "Happy (2) Desktop",
            userAgent: "happy2-gym/operations",
        });
    });
});

async function waitUntil(timestamp: number): Promise<void> {
    const remaining = timestamp - Date.now();
    if (remaining >= 0)
        await new Promise((resolve) => {
            setTimeout(resolve, remaining + 25);
        });
}
