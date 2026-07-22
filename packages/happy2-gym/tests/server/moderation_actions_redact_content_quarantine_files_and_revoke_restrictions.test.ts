import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("moderation action effects", () => {
    it("redacts content, quarantines files, revokes restrictions, and deletes accounts", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            email: "moderation-admin@example.com",
            username: "moderation_admin",
            firstName: "Admin",
        });
        const reporter = await server.createUser({
            email: "moderation-reporter@example.com",
            username: "moderation_reporter",
            firstName: "Reporter",
        });
        const restricted = await server.createUser({
            email: "moderation-restricted@example.com",
            username: "moderation_restricted",
            firstName: "Restricted",
        });
        const deleted = await server.createUser({
            email: "moderation-deleted@example.com",
            username: "moderation_deleted",
            firstName: "Deleted",
        });
        const asAdmin = server.as(admin);
        const asReporter = server.as(reporter);
        const asRestricted = server.as(restricted);
        const asDeleted = server.as(deleted);
        const initialState = (await asAdmin.get("/v0/sync/state")).json().state;

        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Moderation Review",
            slug: "moderation-review",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        for (const userId of [reporter.id, restricted.id, deleted.id])
            await expectStatus(asAdmin, `/v0/chats/${chatId}/addMember`, { userId }, 200);

        const original = await asRestricted.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "moderation redaction needle original",
        });
        expect(original.statusCode).toBe(201);
        const messageId = original.json().message.id as string;
        const edited = await asRestricted.post(`/v0/messages/${messageId}/editMessage`, {
            text: "moderation redaction needle edited",
            expectedRevision: 1,
        });
        expect(edited.statusCode).toBe(200);
        expect(
            (await asReporter.get(`/v0/messages/${messageId}/revisions`)).json().revisions,
        ).toHaveLength(2);

        const messageReportId = await createReport(asReporter, {
            chatId,
            messageId,
            reason: "Reported message contains abusive content",
        });
        const removedMessage = await asAdmin.post(
            `/v0/admin/reports/${messageReportId}/takeAction`,
            { action: "remove_message", reason: "Removed under conduct policy" },
        );
        expect(removedMessage.statusCode).toBe(200);
        expect(removedMessage.json()).toMatchObject({
            action: { action: "remove_message", chatId, messageId },
            sync: { chats: [{ chatId, pts: expect.any(String) }] },
        });
        expect((await asReporter.get(`/v0/messages/${messageId}`)).json().message).toMatchObject({
            id: messageId,
            text: "",
            deletedAt: expect.any(String),
        });
        expect((await asReporter.get(`/v0/messages/${messageId}/revisions`)).statusCode).toBe(404);
        const search = await asReporter.get(
            "/v0/search?q=moderation%20redaction%20needle%20edited",
        );
        expect(search.statusCode).toBe(200);
        expect(
            search
                .json()
                .results.some(
                    (result: { type: string; message?: { id: string } }) =>
                        result.type === "message" && result.message?.id === messageId,
                ),
        ).toBe(false);

        const file = await uploadTextFile(
            asRestricted,
            "reported-evidence.txt",
            "attachment that must become inaccessible",
        );
        const attachmentMessage = await asRestricted.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "reported attachment",
            attachmentFileIds: [file.id],
        });
        expect(attachmentMessage.statusCode).toBe(201);
        const document = await asRestricted.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Moderated evidence",
        });
        const documentId = document.json().document.id as string;
        expect(
            (
                await asRestricted.post(`/v0/documents/${documentId}/attachFile`, {
                    fileId: file.id,
                })
            ).statusCode,
        ).toBe(201);
        expect(
            (await asReporter.get(`/v0/documents/${documentId}`)).json().document.fileAttachments,
        ).toHaveLength(1);
        expect((await asReporter.get(`/v0/files/${file.id}`)).statusCode).toBe(200);
        const fileReportId = await createReport(asReporter, {
            chatId,
            fileId: file.id,
            reason: "Attachment violates policy",
        });
        const removedFile = await asAdmin.post(`/v0/admin/reports/${fileReportId}/takeAction`, {
            action: "remove_file",
            reason: "Quarantined by moderation",
        });
        expect(removedFile.statusCode).toBe(200);
        expect(removedFile.json()).toMatchObject({
            action: { action: "remove_file", fileId: file.id },
            sync: {
                chats: [{ chatId, pts: expect.any(String) }],
                areas: ["files", "documents"],
            },
        });
        expect((await asReporter.get(`/v0/files/${file.id}`)).statusCode).toBe(404);
        expect((await asRestricted.get(`/v0/files/${file.id}`)).statusCode).toBe(404);
        expect(
            (await asReporter.get("/v0/files")).json().files.map((item: { id: string }) => item.id),
        ).not.toContain(file.id);
        expect(
            (await asReporter.get(`/v0/documents/${documentId}`)).json().document.fileAttachments,
        ).toEqual([]);

        const restrictionReportId = await createReport(asReporter, {
            targetUserId: restricted.id,
            chatId,
            reason: "Temporarily restrict posting in this channel",
        });
        const restriction = await asAdmin.post(
            `/v0/admin/reports/${restrictionReportId}/takeAction`,
            {
                action: "restrict",
                reason: "Cooling-off period",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
        );
        expect(restriction.statusCode).toBe(200);
        expect(restriction.json()).toMatchObject({
            action: { action: "restrict", targetUserId: restricted.id, chatId },
            sync: { areas: ["notifications"] },
        });
        const actionId = restriction.json().action.id as string;
        expect(
            (await asRestricted.post(`/v0/chats/${chatId}/sendMessage`, { text: "blocked" }))
                .statusCode,
        ).toBe(403);
        expect((await asRestricted.get("/v0/notifications")).json().notifications).toContainEqual(
            expect.objectContaining({ kind: "moderation", actorUserId: admin.id, chatId }),
        );
        const revoked = await asAdmin.post(`/v0/admin/moderationActions/${actionId}/revokeAction`, {
            reason: "Review complete",
        });
        expect(revoked.statusCode).toBe(200);
        expect(revoked.json()).toMatchObject({
            action: { id: actionId, revokedAt: expect.any(String) },
            sync: { areas: ["notifications"] },
        });
        expect(
            (await asRestricted.post(`/v0/chats/${chatId}/sendMessage`, { text: "allowed" }))
                .statusCode,
        ).toBe(201);
        expect(
            (await asRestricted.get("/v0/notifications"))
                .json()
                .notifications.filter(
                    (notification: { kind: string }) => notification.kind === "moderation",
                ),
        ).toHaveLength(2);

        const ownedChannel = await asDeleted.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Transferred Channel",
            slug: "transferred-channel",
        });
        expect(ownedChannel.statusCode).toBe(201);
        const ownedChatId = ownedChannel.json().chat.id as string;
        await expectStatus(
            asDeleted,
            `/v0/chats/${ownedChatId}/addMember`,
            { userId: admin.id },
            200,
        );
        const deletionReportId = await createReport(asReporter, {
            targetUserId: deleted.id,
            reason: "Delete confirmed abusive account",
        });
        const deletedUser = await asAdmin.post(`/v0/admin/reports/${deletionReportId}/takeAction`, {
            action: "delete_user",
            reason: "Account deletion approved",
        });
        expect(deletedUser.statusCode).toBe(200);
        expect(deletedUser.json()).toMatchObject({
            action: { action: "delete_user", targetUserId: deleted.id },
            sync: { areas: ["users"] },
        });
        expect((await asDeleted.get("/v0/me")).statusCode).toBe(401);
        expect((await asAdmin.get(`/v0/chats/${ownedChatId}`)).json().chat).toMatchObject({
            id: ownedChatId,
            ownerUserId: admin.id,
        });
        expect(
            (await asAdmin.get("/v0/contacts")).json().users.map((user: { id: string }) => user.id),
        ).not.toContain(deleted.id);

        const difference = await asAdmin.post("/v0/sync/getDifference", {
            state: initialState,
            limit: 200,
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().changedChats.map((chat: { id: string }) => chat.id)).toEqual(
            expect.arrayContaining([chatId, ownedChatId]),
        );
        expect(difference.json().areas).toContain("documents");

        const audit = await asAdmin.get("/v0/admin/auditLogs?limit=200");
        expect(audit.statusCode).toBe(200);
        expect(audit.json().auditLogs.map((entry: { action: string }) => entry.action)).toEqual(
            expect.arrayContaining([
                "moderation.remove_message",
                "moderation.remove_file",
                "moderation.restrict",
                "moderation.action_revoked",
                "moderation.delete_user",
            ]),
        );
    });
});

async function createReport(
    client: GymRequestClient,
    payload: Record<string, unknown>,
): Promise<string> {
    const response = await client.post("/v0/reports/createReport", payload);
    expect(response.statusCode).toBe(201);
    return response.json().report.id;
}

async function expectStatus(
    client: GymRequestClient,
    url: string,
    payload: Record<string, unknown>,
    status: number,
): Promise<void> {
    expect((await client.post(url, payload)).statusCode).toBe(status);
}

async function uploadTextFile(
    client: GymRequestClient,
    filename: string,
    contents: string,
): Promise<{ id: string }> {
    const boundary = "happy2-moderation-boundary";
    const payload = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${contents}\r\n--${boundary}--\r\n`,
    );
    const response = await client.post("/v0/files/upload", payload, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(201);
    return response.json().file;
}
