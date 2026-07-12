import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("internet-facing security, privacy, and restart behavior", () => {
    it("treats signed file URLs as narrow bearer capabilities across a virtual restart", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "signed_url_owner" });
        const outsider = await server.createUser({ username: "signed_url_outsider" });
        const asOwner = server.as(owner);
        const asOutsider = server.as(outsider);
        const shared = await uploadTextFile(asOwner, "capability.txt", "a private capability");
        const another = await uploadTextFile(asOwner, "another.txt", "a different private file");

        expect(
            (await asOutsider.post(`/v0/files/${shared.id}/createSignedUrl`, {})).statusCode,
        ).toBe(404);
        const issued = await asOwner.post(`/v0/files/${shared.id}/createSignedUrl`, {});
        expect(issued.statusCode).toBe(200);
        const signed = new URL(issued.json().signedUrl.url as string);
        expect(signed.origin).toBe("http://gym.invalid");
        expect(signed.pathname).toBe(`/v0/files/${shared.id}`);
        expect(signed.searchParams.get("token")).toEqual(expect.any(String));

        const anonymousDownload = await server.get(`${signed.pathname}${signed.search}`);
        expect(anonymousDownload.statusCode).toBe(200);
        expect(anonymousDownload.body).toBe("a private capability");
        expect(
            (
                await server.get(
                    `/v0/files/${another.id}?token=${encodeURIComponent(signed.searchParams.get("token")!)}`,
                )
            ).statusCode,
        ).toBe(401);

        await server.restart();
        expect((await server.get(`${signed.pathname}${signed.search}`)).statusCode).toBe(200);
        expect((await asOwner.post(`/v0/files/${shared.id}/deleteFile`, {})).statusCode).toBe(200);
        expect((await server.get(`${signed.pathname}${signed.search}`)).statusCode).toBe(404);
    });

    it("does not disclose private chat or file state and preserves authority across restart", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            email: "privacy-admin@example.com",
            username: "privacy_admin",
            firstName: "Admin",
        });
        const member = await server.createUser({
            email: "privacy-member@example.com",
            username: "privacy_member",
            firstName: "Member",
        });
        const outsider = await server.createUser({
            email: "privacy-outsider@example.com",
            username: "privacy_outsider",
            firstName: "Outsider",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);
        const outsiderBaseline = (await asOutsider.get("/v0/sync/state")).json().state;

        const created = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Incident Response",
            slug: "incident-response",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        expect(
            (
                await asAdmin.post(`/v0/chats/${chatId}/addMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);

        const file = await uploadTextFile(
            asAdmin,
            "incident-plan.txt",
            "rotate the signing keys at midnight",
        );
        const requestBody = {
            text: "Private incident plan",
            attachmentFileIds: [file.id],
        };
        const firstSend = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, requestBody, {
            headers: { "idempotency-key": "private-plan-v1" },
        });
        expect(firstSend.statusCode).toBe(201);
        const messageId = firstSend.json().message.id as string;
        const conflictingReplay = await asAdmin.post(
            `/v0/chats/${chatId}/sendMessage`,
            { ...requestBody, text: "Changed request body" },
            { headers: { "idempotency-key": "private-plan-v1" } },
        );
        expect(conflictingReplay.statusCode).toBe(409);
        expect(conflictingReplay.json()).toMatchObject({ error: "idempotency_key_reused" });

        expect((await asMember.get(`/v0/chats/${chatId}`)).statusCode).toBe(200);
        expect((await asMember.get(`/v0/files/${file.id}`)).statusCode).toBe(200);
        await expectPrivateResourcesHidden(asOutsider, { chatId, messageId, fileId: file.id });
        const outsiderSearch = await asOutsider.get("/v0/search?q=incidnt%20plan");
        expect(outsiderSearch.statusCode).toBe(200);
        expect(JSON.stringify(outsiderSearch.json())).not.toContain(messageId);
        expect(JSON.stringify(outsiderSearch.json())).not.toContain("Private incident plan");
        const outsiderFiles = await asOutsider.get("/v0/files");
        expect(outsiderFiles.statusCode).toBe(200);
        expect(outsiderFiles.json().files.map((item: { id: string }) => item.id)).not.toContain(
            file.id,
        );
        const outsiderDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: outsiderBaseline,
            limit: 100,
        });
        expect(outsiderDifference.statusCode).toBe(200);
        const serializedDifference = JSON.stringify(outsiderDifference.json());
        expect(serializedDifference).not.toContain(chatId);
        expect(serializedDifference).not.toContain(messageId);
        expect(serializedDifference).not.toContain(file.id);

        expect(
            (
                await asAdmin.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        await expectPrivateResourcesHidden(asMember, { chatId, messageId, fileId: file.id });
        const stateBeforeRestart = (await asAdmin.get("/v0/sync/state")).json().state;
        expect((await asAdmin.post(`/v0/admin/users/${outsider.id}/banUser`)).statusCode).toBe(200);

        await server.restart();

        expect((await asAdmin.get("/v0/auth/session")).statusCode).toBe(200);
        expect((await asOutsider.get("/v0/auth/session")).statusCode).toBe(401);
        await expectPrivateResourcesHidden(asMember, { chatId, messageId, fileId: file.id });
        const fileAfterRestart = await asAdmin.get(`/v0/files/${file.id}`);
        expect(fileAfterRestart.statusCode).toBe(200);
        expect(fileAfterRestart.body).toBe("rotate the signing keys at midnight");

        const stateAfterRestart = (await asAdmin.get("/v0/sync/state")).json().state;
        expect(stateAfterRestart.generation).toBe(stateBeforeRestart.generation);
        expect(BigInt(stateAfterRestart.sequence)).toBeGreaterThanOrEqual(
            BigInt(stateBeforeRestart.sequence),
        );
        const replay = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, requestBody, {
            headers: { "idempotency-key": "private-plan-v1" },
        });
        expect(replay.statusCode).toBe(201);
        expect(replay.headers["idempotency-replayed"]).toBe("true");
        expect(replay.json().message.id).toBe(messageId);
        const messages = await asAdmin.get(`/v0/chats/${chatId}/messages`);
        expect(
            messages
                .json()
                .messages.filter((message: { text: string }) => message.text === requestBody.text),
        ).toHaveLength(1);
    });

    it("returns clear errors, isolates idempotency actions, and applies usable rate limits", async () => {
        await using server = await createGymServer({
            configure(config) {
                config.security.rateLimit.readsPerMinute = 2;
                config.security.rateLimit.writesPerMinute = 2;
            },
        });
        const admin = await server.createUser({ username: "limits_admin" });
        const member = await server.createUser({ username: "limits_member" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);

        const firstRead = await asAdmin.get("/v0/server", {
            headers: { "x-forwarded-for": "198.51.100.10" },
        });
        const secondRead = await asAdmin.get("/v0/server", {
            headers: { "x-forwarded-for": "198.51.100.11" },
        });
        const limitedRead = await asAdmin.get("/v0/server", {
            headers: { "x-forwarded-for": "198.51.100.12" },
        });
        expect(firstRead.statusCode).toBe(200);
        expect(firstRead.headers["ratelimit-limit"]).toBe("2");
        expect(firstRead.headers["ratelimit-remaining"]).toBe("1");
        expect(secondRead.statusCode).toBe(200);
        expect(limitedRead.statusCode).toBe(429);
        expect(limitedRead.headers["retry-after"]).toMatch(/^\d+$/);
        expect(limitedRead.json()).toMatchObject({
            error: "rate_limited",
            retryAfterSeconds: expect.any(Number),
        });

        // Limits are action-scoped: reading one endpoint heavily does not make the API unusable.
        expect((await asAdmin.get("/v0/contacts")).statusCode).toBe(200);

        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Clarity",
            slug: "clarity",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        const malformed = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "valid",
            unexpectedAuthority: "admin",
        });
        expect(malformed.statusCode).toBe(400);
        expect(malformed.json()).toMatchObject({ error: "invalid_request" });
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, { text: "" })).statusCode,
        ).toBe(400);

        const privateChannel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Managers",
            slug: "managers",
        });
        expect(privateChannel.statusCode).toBe(201);
        expect(
            (await asMember.get(`/v0/chats/${privateChannel.json().chat.id as string}`)).statusCode,
        ).toBe(404);
        expect((await asMember.get("/v0/admin/auditLogs")).statusCode).toBe(403);

        // The same key on distinct action paths is unsurprising and does not collide.
        const actionHeaders = { "idempotency-key": "same-human-intent" };
        const topic = await asAdmin.post(
            `/v0/chats/${chatId}/updateTopic`,
            { topic: "API clarity" },
            { headers: actionHeaders },
        );
        const star = await asAdmin.post(
            `/v0/chats/${chatId}/setStar`,
            { starred: true },
            { headers: actionHeaders },
        );
        expect(topic.statusCode).toBe(200);
        expect(star.statusCode).toBe(200);

        await server.restart();
        // The documented local limiter resets with the process, while durable authority does not.
        expect((await asAdmin.get("/v0/server")).statusCode).toBe(200);
    });

    it("keeps resumable uploads owner-scoped, restart-safe, and range-correct", async () => {
        await using server = await createGymServer({
            configure(config) {
                config.files.perUserQuotaBytes = 13;
                config.files.serverQuotaBytes = 100;
            },
        });
        const owner = await server.createUser({ username: "upload_owner" });
        const intruder = await server.createUser({ username: "upload_intruder" });
        const asOwner = server.as(owner);
        const asIntruder = server.as(intruder);
        const contents = "hello restart";

        const cancelled = await asOwner.post("/v0/files/createUpload", {
            filename: "cancelled.txt",
            contentType: "text/plain",
            size: 5,
        });
        expect(cancelled.statusCode).toBe(201);
        const cancelledUploadId = cancelled.json().upload.id as string;
        expect(
            (await asIntruder.post(`/v0/files/${cancelledUploadId}/cancelUpload`)).statusCode,
        ).toBe(404);
        expect((await asOwner.post(`/v0/files/${cancelledUploadId}/cancelUpload`)).statusCode).toBe(
            200,
        );
        expect((await asOwner.get(`/v0/files/${cancelledUploadId}/uploadState`)).statusCode).toBe(
            404,
        );
        expect(
            (await asOwner.post(`/v0/files/${cancelledUploadId}/completeUpload`)).statusCode,
        ).toBe(404);

        const created = await asOwner.post("/v0/files/createUpload", {
            filename: "restart.txt",
            contentType: "text/plain",
            size: Buffer.byteLength(contents),
        });
        expect(created.statusCode).toBe(201);
        const uploadId = created.json().upload.id as string;
        expect((await asIntruder.get(`/v0/files/${uploadId}/uploadState`)).statusCode).toBe(404);
        expect(
            (await appendUpload(asIntruder, uploadId, 0, Buffer.from("stolen"))).statusCode,
        ).toBe(404);

        const firstPart = await appendUpload(asOwner, uploadId, 0, Buffer.from("hello "));
        expect(firstPart.statusCode).toBe(200);
        expect(firstPart.json().upload.offset).toBe(6);

        await server.restart();

        const resumed = await asOwner.get(`/v0/files/${uploadId}/uploadState`);
        expect(resumed.statusCode).toBe(200);
        expect(resumed.json().upload).toMatchObject({ offset: 6, size: contents.length });
        const wrongOffset = await appendUpload(asOwner, uploadId, 0, Buffer.from("restart"));
        expect(wrongOffset.statusCode).toBe(409);
        expect(wrongOffset.headers["upload-offset"]).toBe("6");
        expect(wrongOffset.json()).toMatchObject({ error: "upload_offset_mismatch", offset: 6 });
        expect((await appendUpload(asOwner, uploadId, 6, Buffer.from("restart"))).statusCode).toBe(
            200,
        );

        const complete = await asOwner.post(`/v0/files/${uploadId}/completeUpload`);
        expect(complete.statusCode).toBe(201);
        const fileId = complete.json().file.id as string;
        const replayedComplete = await asOwner.post(`/v0/files/${uploadId}/completeUpload`);
        expect(replayedComplete.statusCode).toBe(201);
        expect(replayedComplete.json().file.id).toBe(fileId);
        await server.restart();
        const replayedAfterRestart = await asOwner.post(`/v0/files/${uploadId}/completeUpload`);
        expect(replayedAfterRestart.statusCode).toBe(201);
        expect(replayedAfterRestart.json().file.id).toBe(fileId);
        const overQuota = await asOwner.post("/v0/files/createUpload", {
            filename: "extra.txt",
            contentType: "text/plain",
            size: 1,
        });
        expect(overQuota.statusCode).toBe(413);
        expect(overQuota.json()).toMatchObject({
            error: "file_quota_exceeded",
            scope: "user",
            limit: 13,
        });
        expect((await asIntruder.get(`/v0/files/${fileId}`)).statusCode).toBe(404);

        const range = await asOwner.get(`/v0/files/${fileId}`, {
            headers: { range: "bytes=6-12" },
        });
        expect(range.statusCode).toBe(206);
        expect(range.body).toBe("restart");
        expect(range.headers["content-range"]).toBe(`bytes 6-12/${contents.length}`);
        const invalidRange = await asOwner.get(`/v0/files/${fileId}`, {
            headers: { range: "bytes=99-100" },
        });
        expect(invalidRange.statusCode).toBe(416);
        expect(invalidRange.headers["content-range"]).toBe(`bytes */${contents.length}`);
    });

    it("keeps scoped integration capabilities usable and revocable across restart", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "restart_integrations_admin" });
        const member = await server.createUser({ username: "restart_integrations_member" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Integration Events",
            slug: "integration-events",
        });
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        const bot = await asAdmin.post("/v0/admin/bots/createBot", {
            name: "Restart Bot",
            username: "restart_bot",
        });
        const botId = bot.json().bot.id as string;
        const integration = await asAdmin.post("/v0/admin/integrations/createIntegration", {
            kind: "service_account",
            name: "Restart service",
            botId,
            scopes: ["messages:write"],
        });
        const integrationId = integration.json().integration.id as string;
        const credential = await asAdmin.post(
            `/v0/admin/integrations/${integrationId}/createCredential`,
            { name: "Restart credential" },
        );
        const apiToken = credential.json().token as string;
        const credentialId = credential.json().credential.id as string;
        const incoming = await asAdmin.post("/v0/admin/integrations/createIncomingWebhook", {
            name: "Restart incoming hook",
            botId,
            chatId,
        });
        const incomingToken = incoming.json().token as string;
        const automation = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "Restart automation hook",
            chatId,
            triggerType: "webhook",
            triggerConfig: {},
            actionType: "send_message",
            actionConfig: { text: "automation survived restart" },
        });
        const automationToken = automation.json().webhookToken as string;

        await server.restart();

        const apiPost = await server.post(
            "/v0/integrations/sendMessage",
            { chatId, text: "credential survived restart" },
            {
                headers: {
                    authorization: `Bearer ${apiToken}`,
                    "idempotency-key": "credential-restart-1",
                },
            },
        );
        expect(apiPost.statusCode).toBe(201);
        const incomingPost = await server.post(
            "/v0/integrations/incomingWebhook",
            { text: "incoming hook survived restart" },
            { headers: { "x-rigged-webhook-token": incomingToken } },
        );
        expect(incomingPost.statusCode).toBe(201);
        expect(
            (
                await server.post("/v0/automations/invokeWebhook", undefined, {
                    headers: { "x-rigged-automation-token": automationToken },
                })
            ).statusCode,
        ).toBe(202);
        const messages = (await asMember.get(`/v0/chats/${chatId}/messages`)).json().messages;
        for (const text of [
            "credential survived restart",
            "incoming hook survived restart",
            "automation survived restart",
        ])
            expect(messages).toContainEqual(expect.objectContaining({ text, kind: "automated" }));
        expect(
            JSON.stringify(await responseJson(asAdmin.get("/v0/admin/integrations"))),
        ).not.toContain(apiToken);
        expect(
            JSON.stringify(await responseJson(asAdmin.get("/v0/admin/automations"))),
        ).not.toContain(automationToken);

        expect(
            (await asAdmin.post(`/v0/admin/credentials/${credentialId}/revokeCredential`))
                .statusCode,
        ).toBe(200);
        expect((await asMember.post("/v0/auth/logout")).statusCode).toBe(204);
        await server.restart();
        expect(
            (
                await server.post(
                    "/v0/integrations/sendMessage",
                    { chatId, text: "revoked credential" },
                    { headers: { authorization: `Bearer ${apiToken}` } },
                )
            ).statusCode,
        ).toBe(401);
        expect((await asMember.get("/v0/auth/session")).statusCode).toBe(401);
    });

    it("resumes scheduled publication and self-destruction after restart", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "restart_timer_admin" });
        const asAdmin = server.as(admin);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Restart Timers",
            slug: "restart-timers",
        });
        const chatId = channel.json().chat.id as string;
        const expiring = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "ephemeral across restart",
            selfDestructSeconds: 1,
        });
        expect(expiring.statusCode).toBe(201);
        const expiringId = expiring.json().message.id as string;
        const scheduled = await asAdmin.post(`/v0/chats/${chatId}/scheduleMessage`, {
            text: "scheduled across restart",
            scheduledFor: new Date(Date.now() + 750).toISOString(),
        });
        expect(scheduled.statusCode).toBe(201);

        await server.restart();

        await eventually(async () => {
            const message = await asAdmin.get(`/v0/messages/${expiringId}`);
            return message.statusCode === 200 && Boolean(message.json().message.deletedAt);
        });
        await eventually(async () => {
            const messages = await asAdmin.get(`/v0/chats/${chatId}/messages`);
            return messages
                .json()
                .messages.some(
                    (message: { text: string }) => message.text === "scheduled across restart",
                );
        });
        const jobs = await asAdmin.get("/v0/scheduledMessages");
        expect(jobs.statusCode).toBe(200);
        expect(jobs.json().messages).toContainEqual(
            expect.objectContaining({
                status: "published",
                publishedMessageId: expect.any(String),
            }),
        );
    });
});

async function responseJson(response: Promise<{ json(): unknown }>): Promise<unknown> {
    return (await response).json();
}

async function eventually(assertion: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await assertion()) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for durable background work");
}

async function expectPrivateResourcesHidden(
    client: GymRequestClient,
    resource: { chatId: string; messageId: string; fileId: string },
): Promise<void> {
    expect((await client.get(`/v0/chats/${resource.chatId}`)).statusCode).toBe(404);
    expect((await client.get(`/v0/chats/${resource.chatId}/messages`)).statusCode).toBe(404);
    expect((await client.get(`/v0/messages/${resource.messageId}`)).statusCode).toBe(404);
    expect((await client.get(`/v0/files/${resource.fileId}`)).statusCode).toBe(404);
    expect((await client.get(`/v0/files/${resource.fileId}/preview`)).statusCode).toBe(404);
}

async function uploadTextFile(
    client: GymRequestClient,
    filename: string,
    contents: string,
): Promise<{ id: string }> {
    const boundary = "rigged-security-boundary";
    const payload = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${contents}\r\n--${boundary}--\r\n`,
    );
    const response = await client.post("/v0/files/upload", payload, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(201);
    return response.json().file;
}

async function appendUpload(
    client: GymRequestClient,
    uploadId: string,
    offset: number,
    contents: Buffer,
) {
    const boundary = "rigged-resume-boundary";
    const payload = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        contents,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return client.post(`/v0/files/${uploadId}/appendUpload`, payload, {
        headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
            "upload-offset": String(offset),
        },
    });
}
