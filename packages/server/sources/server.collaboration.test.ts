import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./modules/auth/tokens.js";
import { defaultConfig } from "./modules/config/defaults.js";
import { Database } from "./modules/database.js";
import { buildServer } from "./server.js";

describe("collaboration HTTP API", () => {
    let app: FastifyInstance;
    let database: Database;
    let directory: string;

    beforeAll(() => {
        const pair = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        process.env.RIGGED_JWT_PRIVATE_KEY_B64 = Buffer.from(pair.privateKey).toString("base64");
        process.env.RIGGED_JWT_PUBLIC_KEY_B64 = Buffer.from(pair.publicKey).toString("base64");
        process.env.RIGGED_PASSWORD_PEPPER = "integration-test-pepper";
    });

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "rigged-http-"));
        const config = defaultConfig();
        config.database.url = `file:${join(directory, "rigged.db")}`;
        config.files.directory = join(directory, "files");
        database = new Database(config.database.url);
        await database.migrate();
        app = await buildServer(config, {
            database,
            tokens: await TokenService.create(config),
        });
    });

    afterEach(async () => {
        await app.close();
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it("serves channels, sync, fuzzy search, streamed files, and admin revocation", async () => {
        const admin = await registerUser(app, "admin@example.com", "admin_user", "Admin");
        const member = await registerUser(app, "member@example.com", "member_user", "Member");
        expect(admin.user.role).toBe("admin");

        const initialState = await app.inject({
            method: "GET",
            url: "/v0/sync/state",
            headers: bearer(admin.token),
        });
        expect(initialState.statusCode).toBe(200);
        const state = initialState.json().state as { generation: string; sequence: string };

        const created = await app.inject({
            method: "POST",
            url: "/v0/chats/createChannel",
            headers: bearer(admin.token),
            payload: { kind: "private_channel", name: "Compiler Team", slug: "compiler-team" },
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        await expectStatus(
            app,
            member.token,
            `/v0/chats/${chatId}/addMember`,
            { userId: member.user.id },
            404,
        );
        await expectStatus(
            app,
            admin.token,
            `/v0/chats/${chatId}/addMember`,
            { userId: member.user.id },
            200,
        );

        const file = await uploadTextFile(app, admin.token, "notes.txt", "compiler rollout");
        const sent = await app.inject({
            method: "POST",
            url: `/v0/chats/${chatId}/sendMessage`,
            headers: bearer(admin.token),
            payload: {
                text: "Deployment completed successfully",
                attachmentFileIds: [file.id],
                clientMutationId: "message-one",
            },
        });
        expect(sent.statusCode).toBe(201);
        const retried = await app.inject({
            method: "POST",
            url: `/v0/chats/${chatId}/sendMessage`,
            headers: bearer(admin.token),
            payload: {
                text: "ignored retry text",
                attachmentFileIds: [file.id],
                clientMutationId: "message-one",
            },
        });
        expect(retried.json().message.id).toBe(sent.json().message.id);

        const memberFiles = await app.inject({
            method: "GET",
            url: "/v0/files",
            headers: bearer(member.token),
        });
        expect(memberFiles.json().files.map((item: { id: string }) => item.id)).toContain(file.id);
        const download = await app.inject({
            method: "GET",
            url: `/v0/files/${file.id}`,
            headers: { ...bearer(member.token), range: "bytes=0-7" },
        });
        expect(download.statusCode).toBe(206);
        expect(download.body).toBe("compiler");

        const search = await app.inject({
            method: "GET",
            url: "/v0/search?q=deplyment",
            headers: bearer(member.token),
        });
        expect(search.statusCode).toBe(200);
        expect(
            search.json().results.some((result: { type: string }) => result.type === "message"),
        ).toBe(true);

        const difference = await app.inject({
            method: "POST",
            url: "/v0/sync/getDifference",
            headers: bearer(member.token),
            payload: { state, limit: 100 },
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().changedChats.map((chat: { id: string }) => chat.id)).toContain(
            chatId,
        );

        await expectStatus(
            app,
            admin.token,
            "/v0/admin/updateServer",
            { name: "Rigged Test", title: "First title" },
            200,
        );
        await expectStatus(app, admin.token, "/v0/admin/updateServer", { title: null }, 200);
        const serverProfile = await app.inject({
            method: "GET",
            url: "/v0/server",
            headers: bearer(admin.token),
        });
        expect(serverProfile.json().server).toMatchObject({ name: "Rigged Test" });
        expect(serverProfile.json().server).not.toHaveProperty("title");

        const ban = await app.inject({
            method: "POST",
            url: `/v0/admin/users/${member.user.id}/banUser`,
            headers: bearer(admin.token),
        });
        expect(ban.statusCode).toBe(200);
        const rejected = await app.inject({
            method: "GET",
            url: "/v0/chats",
            headers: bearer(member.token),
        });
        expect(rejected.statusCode).toBe(401);
    });
});

async function registerUser(
    app: FastifyInstance,
    email: string,
    username: string,
    firstName: string,
): Promise<{ token: string; user: { id: string; role: string } }> {
    const registered = await app.inject({
        method: "POST",
        url: "/v0/auth/password/register",
        payload: { email, password: "correct horse battery staple" },
    });
    expect(registered.statusCode).toBe(201);
    const token = registered.json().token as string;
    const profile = await app.inject({
        method: "POST",
        url: "/v0/me/createProfile",
        headers: bearer(token),
        payload: { firstName, username, email },
    });
    expect(profile.statusCode).toBe(201);
    return { token, user: profile.json().user };
}

async function expectStatus(
    app: FastifyInstance,
    token: string,
    url: string,
    payload: Record<string, unknown>,
    status: number,
): Promise<void> {
    const response = await app.inject({ method: "POST", url, headers: bearer(token), payload });
    expect(response.statusCode).toBe(status);
}

async function uploadTextFile(
    app: FastifyInstance,
    token: string,
    filename: string,
    contents: string,
): Promise<{ id: string }> {
    const boundary = "rigged-test-boundary";
    const payload = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${contents}\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({
        method: "POST",
        url: "/v0/files/upload",
        headers: {
            ...bearer(token),
            "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json().file;
}

function bearer(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
}
