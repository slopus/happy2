import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("HTTP authentication boundary", () => {
    it("keeps product and administrative reads behind an active session", async () => {
        await using server = await createGymServer();
        for (const url of [
            "/v0/me",
            "/v0/chats",
            "/v0/contacts",
            "/v0/directory",
            "/v0/directory/users",
            "/v0/directory/channels",
            "/v0/search?q=anything",
            "/v0/files",
            "/v0/notifications",
            "/v0/presence",
            "/v0/server",
            "/v0/calls",
            "/v0/scheduledMessages",
            "/v0/dataExports",
            "/v0/admin/users",
            "/v0/admin/auditLogs",
            "/v0/admin/bans",
            "/v0/admin/reports",
            "/v0/admin/dataExports",
            "/v0/admin/backups",
            "/v0/admin/retentionRuns",
            "/v0/admin/userAccess",
            "/v0/admin/bots",
            "/v0/admin/integrations",
            "/v0/admin/automations",
            "/v0/slashCommands",
        ]) {
            const response = await server.get(url);
            expect(response.statusCode, url).toBe(401);
        }
    });

    it("authenticates every protected mutation before it reveals route details", async () => {
        await using server = await createGymServer();
        for (const url of [
            "/v0/me/updateProfile",
            "/v0/me/updateAvatar",
            "/v0/me/updateStatus",
            "/v0/me/updatePresence",
            "/v0/me/updateNotificationPreferences",
            "/v0/me/requestDataExport",
            "/v0/chats/createChannel",
            "/v0/chats/createDirectMessage",
            "/v0/chats/createGroupDirectMessage",
            "/v0/chats/reorderStarred",
            "/v0/chats/not-a-chat/join",
            "/v0/chats/not-a-chat/leave",
            "/v0/chats/not-a-chat/sendMessage",
            "/v0/chats/not-a-chat/getDifference",
            "/v0/chats/not-a-chat/setTyping",
            "/v0/messages/not-a-message/editMessage",
            "/v0/messages/not-a-message/deleteMessage",
            "/v0/messages/not-a-message/forwardMessage",
            "/v0/messages/not-a-message/addReaction",
            "/v0/messages/not-a-message/pinMessage",
            "/v0/notifications/markRead",
            "/v0/files/upload",
            "/v0/files/createUpload",
            "/v0/files/not-a-file/createSignedUrl",
            "/v0/files/not-a-file/deleteFile",
            "/v0/sync/getDifference",
            "/v0/sync/acknowledge",
            "/v0/chats/not-a-chat/createCall",
            "/v0/calls/not-a-call/joinCall",
            "/v0/calls/not-a-call/endCall",
            "/v0/calls/not-a-call/sendSignal",
            "/v0/admin/updateServer",
            "/v0/admin/sendAutomatedMessage",
            "/v0/admin/users/not-a-user/banUser",
            "/v0/admin/users/not-a-user/applyBan",
            "/v0/admin/reports/not-a-report/takeAction",
            "/v0/admin/requestDataExport",
            "/v0/admin/backups/createBackupRecord",
            "/v0/admin/retentionRuns/startRetentionRun",
            "/v0/admin/bots/createBot",
            "/v0/admin/integrations/createIntegration",
            "/v0/admin/automations/createAutomation",
            "/v0/slashCommands/invoke",
        ]) {
            const response = await server.post(url, {});
            expect(response.statusCode, url).toBe(401);
        }

        expect((await server.get("/v0/health")).statusCode).toBe(200);
        expect((await server.get("/v0/auth/methods")).statusCode).toBe(200);
        expect((await server.post("/v0/integrations/incomingWebhook", {})).statusCode).toBe(401);
        expect((await server.post("/v0/integrations/sendMessage", {})).statusCode).toBe(401);
        // An automation webhook deliberately hides token existence.
        expect((await server.post("/v0/automations/invokeWebhook", {})).statusCode).toBe(404);
    });
});
