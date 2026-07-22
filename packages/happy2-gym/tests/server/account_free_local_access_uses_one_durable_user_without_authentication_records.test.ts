import { createClient } from "@libsql/client";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, initializeManagedEnvironment, startStandaloneHappy2 } from "happy2-server";
import { createMockRigDaemon, MockSandboxProvider } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("account-free local server access", () => {
    it("uses the bound desktop gateway origin in signed local file URLs", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-local-signed-url-"));
        const webRoot = join(directory, "web");
        const token = "gym-local-signed-url-capability-with-more-than-32-characters";
        const config = defaultConfig(directory);
        config.server.host = "127.0.0.1";
        config.server.port = 0;
        config.server.publicUrl = "http://127.0.0.1";
        config.agents.enabled = false;
        config.auth.local = { enabled: true, tokenEnv: "HAPPY2_UNUSED_LOCAL_TOKEN" };
        config.auth.password.enabled = false;
        await Promise.all([
            mkdir(webRoot, { recursive: true }),
            mkdir(join(directory, ".happy2"), { recursive: true }),
        ]);
        await writeFile(join(webRoot, "index.html"), "<!doctype html><div>Happy</div>");
        await initializeManagedEnvironment(join(directory, ".happy2", "happy2.toml"), config);

        try {
            await using running = await startStandaloneHappy2(config, {
                localAccessToken: token,
                logger: false,
                webRoot,
            });
            const form = new FormData();
            form.append("file", new Blob(["local attachment"]), "local.txt");
            const upload = await fetch(`${running.url}/v0/files/upload`, {
                body: form,
                headers: { authorization: `Bearer ${token}` },
                method: "POST",
            });
            expect(upload.status).toBe(201);
            const fileId = ((await upload.json()) as { file: { id: string } }).file.id;
            const signed = await fetch(`${running.url}/v0/files/${fileId}/createSignedUrl`, {
                body: "{}",
                headers: {
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                },
                method: "POST",
            });
            expect(signed.status).toBe(200);
            expect(
                new URL(((await signed.json()) as { signedUrl: { url: string } }).signedUrl.url)
                    .origin,
            ).toBe(running.url);
        } finally {
            await rm(directory, { force: true, recursive: true });
        }
    });

    it("uses one durable local user and never creates accounts, sessions, or registration routes", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-local-access-"));
        const databaseUrl = `file:${join(directory, "happy2.db")}`;
        const token = "gym-local-capability-token-with-more-than-32-characters";
        const tokenEnv = `HAPPY2_GYM_LOCAL_${process.pid}_${Date.now()}`;
        process.env[tokenEnv] = token;
        try {
            await using server = await createGymServer({
                databaseUrl,
                configure(config) {
                    config.server.host = "127.0.0.1";
                    config.server.publicUrl = "http://127.0.0.1:47831";
                    config.server.trustedProxyHops = 0;
                    config.auth.local = { enabled: true, tokenEnv };
                    config.auth.password.enabled = false;
                    config.auth.devTokens.enabled = false;
                },
            });
            const local = bearerClient(server, token);

            expect((await server.get("/v0/me")).statusCode).toBe(401);
            expect(
                (
                    await server.get("/v0/me", {
                        headers: { cookie: `happy2_auth_token=${token}` },
                    })
                ).statusCode,
            ).toBe(401);
            expect((await bearerClient(server, `${token}-wrong`).get("/v0/me")).statusCode).toBe(
                401,
            );
            expect((await server.get("/v0/auth/methods")).json()).toEqual({
                role: "all",
                method: "local",
                devTokensEnabled: false,
                registration: "closed",
            });
            const me = await local.get("/v0/me");
            expect(me.statusCode).toBe(200);
            expect(me.json().user).toMatchObject({
                firstName: "Local User",
                kind: "human",
                role: "admin",
            });
            expect(me.json().permissions.owner).toBe(true);
            const userId = me.json().user.id as string;
            const initialAdministration = await local.get("/v0/admin/users");
            expect(initialAdministration.statusCode).toBe(200);
            const localAdministrationUser = initialAdministration
                .json()
                .users.find((user: { id: string }) => user.id === userId);
            expect(localAdministrationUser).toMatchObject({
                id: userId,
                kind: "human",
            });
            expect(localAdministrationUser).not.toHaveProperty("email");
            const setupOwnerClient = createClient({ url: databaseUrl });
            try {
                expect(
                    (
                        await setupOwnerClient.execute(
                            "SELECT bootstrap_account_id, bootstrap_admin_user_id, registration_enabled FROM server_setup_state WHERE id = 1",
                        )
                    ).rows[0],
                ).toMatchObject({
                    bootstrap_account_id: null,
                    bootstrap_admin_user_id: userId,
                    registration_enabled: 0,
                });
            } finally {
                setupOwnerClient.close();
            }

            expect((await local.get("/v0/auth/session")).json()).toEqual({
                user: me.json().user,
                authentication: "local",
            });
            expect((await local.get("/v0/auth/web/session")).statusCode).toBe(200);
            expect((await local.get("/v0/setup")).json()).toMatchObject({
                user: { profile: "complete", complete: true },
                server: { canManage: true, registration: "closed" },
                route: { scope: "server", step: "sandbox_provider_selected" },
            });
            expect(
                (
                    await server.post("/v0/auth/password/register", {
                        email: "local@example.test",
                        password: "not-used-in-local-mode",
                    })
                ).statusCode,
            ).toBe(404);
            expect(
                (
                    await local.post("/v0/me/createProfile", {
                        firstName: "Another",
                        username: "another_local",
                    })
                ).statusCode,
            ).toBe(401);

            await expectAuthenticationRows(databaseUrl, {
                accounts: 0,
                sessions: 0,
                devTokens: 0,
                localUsers: 1,
            });
            await server.restart();
            expect((await local.get("/v0/me")).json().user.id).toBe(userId);
            await expectAuthenticationRows(databaseUrl, {
                accounts: 0,
                sessions: 0,
                devTokens: 0,
                localUsers: 1,
            });

            const rotatedToken = `${token}-rotated`;
            process.env[tokenEnv] = rotatedToken;
            await server.restart();
            expect((await local.get("/v0/me")).statusCode).toBe(401);
            const rotatedLocal = bearerClient(server, rotatedToken);
            expect((await rotatedLocal.get("/v0/me")).json().user.id).toBe(userId);

            await server.completeSetup({ actorUserId: userId, registrationEnabled: false });
            const ownershipClient = createClient({ url: databaseUrl });
            try {
                const main = await ownershipClient.execute(
                    "SELECT id, created_by_user_id, owner_user_id, default_agent_user_id FROM chats WHERE is_main = 1 AND deleted_at IS NULL",
                );
                expect(main.rows).toEqual([
                    expect.objectContaining({
                        owner_user_id: null,
                    }),
                ]);
                const mainId = main.rows[0]!.id as string;
                expect(main.rows[0]!.created_by_user_id).toBe(main.rows[0]!.default_agent_user_id);
                const memberships = await ownershipClient.execute({
                    sql: `SELECT users.kind, chat_members.role
                        FROM chat_members
                        JOIN users ON users.id = chat_members.user_id
                        WHERE chat_members.chat_id = ? AND chat_members.left_at IS NULL
                        ORDER BY users.kind`,
                    args: [mainId],
                });
                expect(memberships.rows).toEqual([
                    expect.objectContaining({ kind: "agent", role: "admin" }),
                    expect.objectContaining({ kind: "human", role: "member" }),
                ]);
            } finally {
                ownershipClient.close();
            }
            const completedAdministration = await rotatedLocal.get("/v0/admin/users");
            expect(completedAdministration.statusCode).toBe(200);
            expect(
                completedAdministration
                    .json()
                    .users.find((user: { kind: string }) => user.kind === "agent"),
            ).toMatchObject({ kind: "agent" });
            expect((await rotatedLocal.get("/v0/setup")).json()).toMatchObject({
                complete: true,
                route: { scope: "complete" },
            });
            expect(
                (
                    await rotatedLocal.post("/v0/setup/chooseRegistrationPolicy", {
                        enabled: true,
                    })
                ).statusCode,
            ).toBe(409);
            expect((await rotatedLocal.get("/v0/chats")).statusCode).toBe(200);
            const channel = await rotatedLocal.post("/v0/chats/createChannel", {
                kind: "private_channel",
                name: "Only on this Mac",
                slug: "only-on-this-mac",
            });
            expect(channel.statusCode).toBe(201);
            const agentUserId = completedAdministration
                .json()
                .users.find((user: { kind: string }) => user.kind === "agent").id as string;
            expect(
                (
                    await rotatedLocal.post(`/v0/chats/${channel.json().chat.id}/setMemberRole`, {
                        userId: agentUserId,
                        role: "owner",
                    })
                ).statusCode,
            ).toBe(400);
            await expectAuthenticationRows(databaseUrl, {
                accounts: 0,
                sessions: 0,
                devTokens: 0,
                localUsers: 1,
            });
        } finally {
            delete process.env[tokenEnv];
            await rm(directory, { force: true, recursive: true });
        }
    });

    it("refuses to reinterpret an account-backed database as account-free local state", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-local-reject-account-"));
        const databaseUrl = `file:${join(directory, "happy2.db")}`;
        const tokenEnv = `HAPPY2_GYM_LOCAL_REJECT_${process.pid}_${Date.now()}`;
        process.env[tokenEnv] = "gym-local-capability-token-with-more-than-32-characters";
        try {
            {
                await using accountServer = await createGymServer({ databaseUrl });
                await accountServer.createUser({ username: "existing_account_user" });
            }
            await expect(
                createGymServer({
                    databaseUrl,
                    configure(config) {
                        config.server.host = "127.0.0.1";
                        config.server.publicUrl = "http://127.0.0.1:47831";
                        config.auth.local = { enabled: true, tokenEnv };
                        config.auth.password.enabled = false;
                    },
                }),
            ).rejects.toThrow("cannot use an account-backed database");
        } finally {
            delete process.env[tokenEnv];
            await rm(directory, { force: true, recursive: true });
        }
    });

    it("refuses to start without a high-entropy desktop capability", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-local-missing-token-"));
        const tokenEnv = `HAPPY2_GYM_LOCAL_MISSING_${process.pid}_${Date.now()}`;
        try {
            await expect(
                createGymServer({
                    databaseUrl: `file:${join(directory, "happy2.db")}`,
                    configure(config) {
                        config.server.host = "127.0.0.1";
                        config.server.publicUrl = "http://127.0.0.1:47831";
                        config.auth.local = { enabled: true, tokenEnv };
                        config.auth.password.enabled = false;
                    },
                }),
            ).rejects.toThrow("must contain a 32-4096 character local access token");
        } finally {
            await rm(directory, { force: true, recursive: true });
        }
    });

    it("keeps account registration closed if the same database is misconfigured for password auth", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-local-mode-switch-"));
        const databaseUrl = `file:${join(directory, "happy2.db")}`;
        const tokenEnv = `HAPPY2_GYM_LOCAL_SWITCH_${process.pid}_${Date.now()}`;
        process.env[tokenEnv] = "gym-local-switch-capability-with-more-than-32-characters";
        const previousPepper = process.env.HAPPY2_PASSWORD_PEPPER;
        try {
            {
                await using localServer = await createGymServer({
                    databaseUrl,
                    configure(config) {
                        config.server.host = "127.0.0.1";
                        config.server.publicUrl = "http://127.0.0.1:47831";
                        config.auth.local = { enabled: true, tokenEnv };
                        config.auth.password.enabled = false;
                    },
                });
                expect(
                    (await bearerClient(localServer, process.env[tokenEnv]!).get("/v0/me"))
                        .statusCode,
                ).toBe(200);
            }
            process.env.HAPPY2_PASSWORD_PEPPER = "gym-local-mode-switch-password-pepper";
            await using passwordServer = await createGymServer({
                databaseUrl,
                configure(config) {
                    config.auth.local.enabled = false;
                    config.auth.password.enabled = true;
                },
            });
            expect(
                (
                    await passwordServer.post("/v0/auth/password/register", {
                        email: "must-not-register@example.test",
                        password: "correct horse battery staple",
                    })
                ).statusCode,
            ).toBe(403);
            await expectAuthenticationRows(databaseUrl, {
                accounts: 0,
                sessions: 0,
                devTokens: 0,
                localUsers: 1,
            });
        } finally {
            delete process.env[tokenEnv];
            if (previousPepper === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
            else process.env.HAPPY2_PASSWORD_PEPPER = previousPepper;
            await rm(directory, { force: true, recursive: true });
        }
    });

    it("promotes a built base image through the real local setup worker", async () => {
        await using rig = await createMockRigDaemon();
        const provider = new MockSandboxProvider("docker", "Docker", {
            health: "healthy",
            detail: "Docker is ready.",
            version: "Docker local gym 1.0",
        });
        const token = "gym-local-build-capability-with-more-than-32-characters";
        const tokenEnv = `HAPPY2_GYM_LOCAL_BUILD_${process.pid}_${Date.now()}`;
        process.env[tokenEnv] = token;
        try {
            await using server = await createGymServer({
                databaseMode: "file",
                sandboxProviders: [provider],
                configure(config) {
                    config.server.host = "127.0.0.1";
                    config.server.publicUrl = "http://127.0.0.1:47831";
                    config.auth.local = { enabled: true, tokenEnv };
                    config.auth.password.enabled = false;
                    config.agents.enabled = true;
                    config.agents.socketPath = rig.socketPath;
                    config.agents.tokenPath = rig.tokenPath;
                    config.agents.defaultCwd = rig.workspaceRoot;
                },
            });
            const local = bearerClient(server, token);
            expect(
                (
                    await local.post("/v0/setup/selectSandboxProvider", {
                        providerId: "docker",
                    })
                ).statusCode,
            ).toBe(200);
            const selected = await local.post("/v0/setup/selectBaseImage", {
                custom: {
                    name: "Local tools",
                    dockerfile: "FROM ubuntu:24.04\nRUN echo local-tools\n",
                },
            });
            expect(selected.statusCode).toBe(202);
            const imageId = selected.json().baseImages.selectedImage.id as string;
            let baseImages:
                | {
                      defaultImageId?: string;
                      selectedImage?: { id: string; status: string };
                  }
                | undefined;
            await waitFor(async () => {
                baseImages = (await local.get("/v0/setup/baseImages")).json();
                return baseImages?.selectedImage?.status === "ready";
            }, "the local setup image to be promoted");
            expect(baseImages).toMatchObject({
                defaultImageId: imageId,
                selectedImage: { id: imageId, status: "ready" },
            });
            expect((await local.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "default_agent_created" },
                server: { steps: { base_image_ready: { state: "complete" } } },
            });
        } finally {
            delete process.env[tokenEnv];
        }
    });
});

function bearerClient(server: GymRequestClient, token: string): GymRequestClient {
    const request = (options: Parameters<GymRequestClient["request"]>[0]) =>
        server.request({
            ...options,
            headers: { ...options.headers, authorization: `Bearer ${token}` },
        });
    return {
        request,
        get: (url, options = {}) => request({ ...options, method: "GET", url }),
        post: (url, payload, options = {}) => request({ ...options, method: "POST", url, payload }),
    };
}

async function expectAuthenticationRows(
    databaseUrl: string,
    expected: { accounts: number; sessions: number; devTokens: number; localUsers: number },
): Promise<void> {
    const client = createClient({ url: databaseUrl });
    try {
        const [accounts, sessions, devTokens, localUsers] = await Promise.all([
            count(client, "SELECT count(*) AS count FROM accounts"),
            count(client, "SELECT count(*) AS count FROM auth_sessions"),
            count(client, "SELECT count(*) AS count FROM auth_dev_tokens"),
            count(
                client,
                "SELECT count(*) AS count FROM users WHERE kind = 'human' AND active = 1 AND deleted_at IS NULL",
            ),
        ]);
        expect({ accounts, sessions, devTokens, localUsers }).toEqual(expected);
    } finally {
        client.close();
    }
}

async function count(client: ReturnType<typeof createClient>, sql: string): Promise<number> {
    const result = await client.execute(sql);
    return Number(result.rows[0]?.count);
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}
