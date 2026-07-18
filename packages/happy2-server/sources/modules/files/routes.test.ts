import { createDatabase, schema, type DrizzleExecutor } from "../drizzle.js";
import { createClient, type Client } from "@libsql/client";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../../server.js";
import { TokenService } from "../auth/tokens.js";
import { defaultConfig } from "../config/defaults.js";
import {
    setupChooseRegistrationPolicy,
    setupCreateDefaultAgent,
    setupRecordOperationalStep,
} from "../setup/index.js";
import { eq } from "drizzle-orm";
describe("file pipeline HTTP API", () => {
    let app: FastifyInstance;
    let client: Client;
    let executor: DrizzleExecutor;
    let directory: string;
    beforeAll(() => {
        const pair = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: "spki",
                format: "pem",
            },
            privateKeyEncoding: {
                type: "pkcs8",
                format: "pem",
            },
        });
        process.env.HAPPY2_JWT_PRIVATE_KEY_B64 = Buffer.from(pair.privateKey).toString("base64");
        process.env.HAPPY2_JWT_PUBLIC_KEY_B64 = Buffer.from(pair.publicKey).toString("base64");
        process.env.HAPPY2_PASSWORD_PEPPER = "file-route-test-pepper";
    });
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-file-routes-"));
        const config = defaultConfig();
        config.database.url = `file:${join(directory, "happy2.db")}`;
        config.files.directory = join(directory, "files");
        config.agents.enabled = false;
        client = createClient({ url: config.database.url });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        app = await buildServer(config, {
            client,
            tokens: await TokenService.create(config),
        });
    });
    afterEach(async () => {
        await app.close();
        client.close();
        await rm(directory, {
            recursive: true,
            force: true,
        });
    });
    it("persists resumable offsets and completes the attachment", async () => {
        const owner = await registerUser(app, "owner@example.com", "file_owner");
        await completeSetup(executor, owner.userId);
        const stranger = await registerUser(app, "stranger@example.com", "file_stranger");
        const created = await app.inject({
            method: "POST",
            url: "/v0/files/createUpload",
            headers: bearer(owner.token),
            payload: {
                filename: "resume.txt",
                contentType: "text/plain",
                size: 6,
            },
        });
        expect(created.statusCode).toBe(201);
        const uploadId = created.json().upload.id as string;
        const first = await appendChunk(app, owner.token, uploadId, 0, Buffer.from("abc"));
        expect(first.statusCode).toBe(200);
        expect(first.json().upload.offset).toBe(3);
        const hidden = await app.inject({
            method: "GET",
            url: `/v0/files/${uploadId}/uploadState`,
            headers: bearer(stranger.token),
        });
        expect(hidden.statusCode).toBe(404);
        const stale = await appendChunk(app, owner.token, uploadId, 0, Buffer.from("x"));
        expect(stale.statusCode).toBe(409);
        expect(stale.headers["upload-offset"]).toBe("3");
        const incomplete = await app.inject({
            method: "POST",
            url: `/v0/files/${uploadId}/completeUpload`,
            headers: bearer(owner.token),
        });
        expect(incomplete.statusCode).toBe(409);
        await appendChunk(app, owner.token, uploadId, 3, Buffer.from("def"));
        const completed = await app.inject({
            method: "POST",
            url: `/v0/files/${uploadId}/completeUpload`,
            headers: bearer(owner.token),
        });
        expect(completed.statusCode).toBe(201);
        const fileId = completed.json().file.id as string;
        const retried = await app.inject({
            method: "POST",
            url: `/v0/files/${uploadId}/completeUpload`,
            headers: bearer(owner.token),
        });
        expect(retried.statusCode).toBe(201);
        expect(retried.json().file.id).toBe(fileId);
        const download = await app.inject({
            method: "GET",
            url: `/v0/files/${fileId}`,
            headers: bearer(owner.token),
        });
        expect(download.body).toBe("abcdef");
    });
    it("serves generated previews only through the parent file's privacy check", async () => {
        const owner = await registerUser(app, "photo@example.com", "photo_owner");
        await completeSetup(executor, owner.userId);
        const stranger = await registerUser(app, "viewer@example.com", "photo_viewer");
        const png = await sharp({
            create: {
                width: 20,
                height: 10,
                channels: 4,
                background: "#336699",
            },
        })
            .png()
            .toBuffer();
        const uploaded = await upload(app, owner.token, "photo.png", "image/png", png);
        const previewUrl = uploaded.json().file.previewUrl as string;
        expect(previewUrl).toBe(`/v0/files/${uploaded.json().file.id}/preview`);
        const preview = await app.inject({
            method: "GET",
            url: previewUrl,
            headers: bearer(owner.token),
        });
        expect(preview.statusCode).toBe(200);
        expect(preview.headers["content-type"]).toBe("image/webp");
        const hidden = await app.inject({
            method: "GET",
            url: previewUrl,
            headers: bearer(stranger.token),
        });
        expect(hidden.statusCode).toBe(404);
    });
});
async function registerUser(
    app: FastifyInstance,
    email: string,
    username: string,
): Promise<{
    token: string;
    userId: string;
}> {
    const registered = await app.inject({
        method: "POST",
        url: "/v0/auth/password/register",
        payload: {
            email,
            password: "correct horse battery staple",
        },
    });
    const token = registered.json().token as string;
    const profile = await app.inject({
        method: "POST",
        url: "/v0/me/createProfile",
        headers: bearer(token),
        payload: {
            firstName: "Files",
            username,
            email,
        },
    });
    expect(profile.statusCode).toBe(201);
    return {
        token,
        userId: profile.json().user.id as string,
    };
}
async function completeSetup(executor: DrizzleExecutor, actorUserId: string): Promise<void> {
    const imageId = "file-routes-ready-image";
    await executor.insert(schema.agentImages).values({
        id: imageId,
        name: "File routes ready image",
        dockerfile: "FROM scratch",
        definitionHash: "file-routes-ready-image-hash",
        dockerTag: "file-routes:ready",
        status: "ready",
        buildProgress: 100,
        dockerImageId: "sha256:file-routes-ready",
        readyAt: new Date().toISOString(),
    });
    await executor
        .update(schema.agentImageSettings)
        .set({ defaultImageId: imageId, updatedByUserId: actorUserId })
        .where(eq(schema.agentImageSettings.id, 1));
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
            actorUserId,
            ...(step.startsWith("base_image_") ? { metadata: { imageId } } : {}),
        });
    await setupCreateDefaultAgent(executor, {
        actorUserId,
        name: "Happy",
        username: "happy",
    });
    await setupChooseRegistrationPolicy(executor, actorUserId, true);
}
function appendChunk(
    app: FastifyInstance,
    token: string,
    uploadId: string,
    offset: number,
    contents: Buffer,
) {
    return upload(app, token, "chunk.bin", "application/octet-stream", contents, {
        url: `/v0/files/${uploadId}/appendUpload`,
        headers: {
            "upload-offset": String(offset),
        },
    });
}
function upload(
    app: FastifyInstance,
    token: string,
    filename: string,
    contentType: string,
    contents: Buffer,
    options: {
        url?: string;
        headers?: Record<string, string>;
    } = {},
) {
    const boundary = `happy2-file-${Date.now()}`;
    const payload = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
        ),
        contents,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
        method: "POST",
        url: options.url ?? "/v0/files/upload",
        headers: {
            ...bearer(token),
            "content-type": `multipart/form-data; boundary=${boundary}`,
            ...options.headers,
        },
        payload,
    });
}
function bearer(token: string): {
    authorization: string;
} {
    return {
        authorization: `Bearer ${token}`,
    };
}
