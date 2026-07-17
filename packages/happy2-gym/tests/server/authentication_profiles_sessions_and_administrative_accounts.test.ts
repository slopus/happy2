import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { once } from "node:events";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createNetServer, type Server as NetServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import type { InjectOptions } from "fastify";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymServer } from "../../sources/index.js";

type RequestOptions = Omit<InjectOptions, "method" | "url" | "payload">;

/**
 * These flows intentionally exercise the public auth surface rather than Gym's
 * direct createUser helper. The two retry tests at the bottom are known failures
 * kept as ordinary assertions so they continue to describe the desired API.
 */
describe("authentication, profiles, sessions, and administrative accounts", () => {
    it("registers a password account, activates its profile, refreshes one session, and logs out only that session", async () => {
        await withEnvironment({ HAPPY2_PASSWORD_PEPPER: "gym-auth-password-pepper" }, async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });

            expect((await server.get("/v0/auth/methods")).json()).toEqual({
                role: "all",
                method: "password",
                signupEnabled: true,
                registration: "bootstrap",
            });
            expect(
                (
                    await server.post("/v0/auth/password/register", {
                        email: "not-an-email",
                        password: "short",
                    })
                ).json(),
            ).toEqual({ error: "invalid_credentials" });

            const email = "ada.password@example.com";
            const password = "correct horse battery staple";
            const registered = await server.post("/v0/auth/password/register", {
                email: `  ${email.toUpperCase()}  `,
                password,
            });
            expect(registered.statusCode).toBe(201);
            expect(registered.json()).toMatchObject({
                token: expect.any(String),
                expiresAt: expect.any(String),
                profileRequired: true,
            });
            const provisionalToken = registered.json().token as string;
            const provisional = tokenClient(server, provisionalToken);

            // An account cannot use product routes before it has an active profile.
            expect((await provisional.get("/v0/me")).statusCode).toBe(401);
            expect((await provisional.get("/v0/auth/session")).statusCode).toBe(401);
            const provisionalRefresh = await provisional.post("/v0/auth/refresh");
            expect(provisionalRefresh.statusCode).toBe(200);
            expect(provisionalRefresh.json()).toMatchObject({
                token: expect.any(String),
                expiresAt: expect.any(String),
                profileRequired: true,
            });

            const createdProfile = await provisional.post("/v0/me/createProfile", {
                firstName: "Ada",
                lastName: "Lovelace",
                username: "ada_password",
                email,
                phone: "+1 555 0100",
            });
            expect(createdProfile.statusCode).toBe(201);
            expect(createdProfile.json().user).toMatchObject({
                firstName: "Ada",
                lastName: "Lovelace",
                username: "ada_password",
                email,
                phone: "+1 555 0100",
                role: "admin",
            });

            const replacementProfile = {
                firstName: "Ada Byron",
                lastName: "King",
                username: "ada_password",
                email,
                phone: "+1 555 0102",
            };
            const profileMutation = { headers: { "idempotency-key": "profile-update-v1" } };
            const updated = await provisional.post(
                "/v0/me/updateProfile",
                replacementProfile,
                profileMutation,
            );
            expect(updated.statusCode).toBe(200);
            expect(updated.json().user).toMatchObject(replacementProfile);
            const replayedUpdate = await provisional.post(
                "/v0/me/updateProfile",
                replacementProfile,
                profileMutation,
            );
            expect(replayedUpdate.statusCode).toBe(200);
            expect(replayedUpdate.headers["idempotency-replayed"]).toBe("true");

            const beforeRefresh = await provisional.get("/v0/auth/session");
            expect(beforeRefresh.statusCode).toBe(200);
            const firstSessionId = beforeRefresh.json().sessionId as string;
            const refreshed = await provisional.post("/v0/auth/refresh");
            expect(refreshed.statusCode).toBe(200);
            expect(refreshed.json().profileRequired).toBe(false);
            const refreshedToken = refreshed.json().token as string;
            const refreshedClient = tokenClient(server, refreshedToken);
            expect((await refreshedClient.get("/v0/auth/session")).json()).toMatchObject({
                sessionId: firstSessionId,
            });

            expect(
                (
                    await server.post("/v0/auth/password/login", {
                        email,
                        password: "definitely the wrong password",
                    })
                ).json(),
            ).toEqual({ error: "invalid_credentials" });

            const secondLogin = await server.post("/v0/auth/password/login", { email, password });
            expect(secondLogin.statusCode).toBe(200);
            expect(secondLogin.json().profileRequired).toBe(false);
            const secondClient = tokenClient(server, secondLogin.json().token as string);
            const secondSessionId = (await secondClient.get("/v0/auth/session")).json()
                .sessionId as string;
            expect(secondSessionId).not.toBe(firstSessionId);

            await server.restart();
            expect((await refreshedClient.get("/v0/me")).statusCode).toBe(200);
            expect((await secondClient.get("/v0/me")).statusCode).toBe(200);

            // Refresh preserves the original session, so logging out either bearer
            // invalidates both of those tokens but not a separately logged-in session.
            expect((await provisional.post("/v0/auth/logout")).statusCode).toBe(204);
            expect((await refreshedClient.get("/v0/me")).statusCode).toBe(401);
            expect((await secondClient.get("/v0/me")).statusCode).toBe(200);
        });
    });

    it("allows one bootstrap registration before a registration policy exists", async () => {
        await withEnvironment(
            { HAPPY2_PASSWORD_PEPPER: "gym-auth-closed-signup-pepper" },
            async () => {
                await using server = await createGymServer({
                    configure(config) {
                        config.auth.password.enabled = true;
                    },
                });
                expect((await server.get("/v0/auth/methods")).json()).toEqual({
                    role: "all",
                    method: "password",
                    signupEnabled: true,
                    registration: "bootstrap",
                });
                const payload = {
                    email: "closed-signup@example.com",
                    password: "correct horse battery staple",
                };
                expect((await server.post("/v0/auth/password/register", payload)).statusCode).toBe(
                    201,
                );
                expect((await server.get("/v0/auth/methods")).json()).toMatchObject({
                    signupEnabled: false,
                    registration: "closed",
                });
                expect(
                    (
                        await server.post("/v0/auth/password/register", {
                            email: "another@example.com",
                            password: payload.password,
                        })
                    ).statusCode,
                ).toBe(403);
                expect((await server.post("/v0/auth/password/register", payload)).statusCode).toBe(
                    403,
                );
                expect((await server.post("/v0/auth/password/login", payload)).statusCode).toBe(
                    200,
                );
            },
        );
    });

    it("reports duplicate password registration as a conflict", async () => {
        await withEnvironment({ HAPPY2_PASSWORD_PEPPER: "gym-auth-duplicate-pepper" }, async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const payload = {
                email: "duplicate-password@example.com",
                password: "correct horse battery staple",
            };
            const registered = await server.post("/v0/auth/password/register", payload);
            expect(registered.statusCode).toBe(201);
            const admin = tokenClient(server, registered.json().token as string);
            const profile = await admin.post("/v0/me/createProfile", {
                firstName: "Duplicate",
                username: "duplicate_password_admin",
                email: payload.email,
            });
            await server.completeSetup({
                actorUserId: profile.json().user.id as string,
                registrationEnabled: true,
            });

            // Once registration is open, a known account is a clear conflict.
            const duplicate = await server.post("/v0/auth/password/register", payload);
            expect(duplicate.statusCode).toBe(409);
            expect(duplicate.json()).toEqual({ error: "account_exists" });
        });
    });

    it("uses a one-time magic link without exposing account state before profile activation", async () => {
        const inbox = await createSmtpInbox();
        await withEnvironment(
            {
                EMAIL_SMTP_HOST: "127.0.0.1",
                EMAIL_SMTP_PORT: String(inbox.port),
                EMAIL_SMTP_USER: "gym-user",
                EMAIL_SMTP_PASSWORD: "gym-password",
                EMAIL_FROM: "Happy (2) Gym <no-reply@gym.invalid>",
            },
            async () => {
                try {
                    await using server = await createGymServer({
                        configure(config) {
                            config.auth.magicLink.enabled = true;
                            config.auth.magicLink.from = "Happy (2) Gym <no-reply@gym.invalid>";
                            config.auth.magicLink.redirectUrl = "happy2://auth/magic-link";
                        },
                    });
                    expect(
                        (
                            await server.post("/v0/auth/magic-link/request", {
                                email: "mistyped-bootstrap@example.com",
                            })
                        ).statusCode,
                    ).toBe(202);
                    await inbox.nextMessage();
                    expect((await server.get("/v0/setup/status")).json()).toMatchObject({
                        registration: "bootstrap",
                    });

                    const bootstrapEmail = "magic.bootstrap@example.com";
                    expect(
                        (
                            await server.post("/v0/auth/magic-link/request", {
                                email: bootstrapEmail,
                            })
                        ).statusCode,
                    ).toBe(202);
                    const bootstrapToken = magicLinkToken(await inbox.nextMessage());
                    const bootstrapVerification = await server.post("/v0/auth/magic-link/verify", {
                        token: bootstrapToken,
                    });
                    expect(bootstrapVerification.statusCode).toBe(200);
                    expect(bootstrapVerification.json().token).toEqual(expect.any(String));
                    const asAdmin = tokenClient(
                        server,
                        bootstrapVerification.json().token as string,
                    );
                    const bootstrapProfile = await asAdmin.post("/v0/me/createProfile", {
                        firstName: "Magic",
                        username: "magic_link_admin",
                        email: bootstrapEmail,
                    });
                    expect(bootstrapProfile.statusCode).toBe(201);
                    expect(bootstrapProfile.json().user.role).toBe("admin");

                    // The endpoint remains enumeration-safe, but no second account or email is
                    // created while the bootstrap administrator is still configuring the server.
                    expect(
                        (
                            await server.post("/v0/auth/magic-link/request", {
                                email: "blocked.magic@example.com",
                            })
                        ).statusCode,
                    ).toBe(202);
                    expect(inbox.pendingMessages()).toBe(0);
                    expect(
                        (
                            await server.post("/v0/auth/magic-link/request", {
                                email: bootstrapEmail,
                            })
                        ).statusCode,
                    ).toBe(202);
                    const closedLoginToken = magicLinkToken(await inbox.nextMessage());
                    expect(
                        (
                            await server.post("/v0/auth/magic-link/verify", {
                                token: closedLoginToken,
                            })
                        ).statusCode,
                    ).toBe(200);
                    await server.completeSetup({
                        actorUserId: bootstrapProfile.json().user.id as string,
                        registrationEnabled: true,
                    });
                    const email = "magic.link@example.com";

                    expect((await server.get("/v0/auth/methods")).json()).toEqual({
                        role: "all",
                        method: "magic_link",
                        registration: "open",
                    });
                    const request = await server.post("/v0/auth/magic-link/request", { email });
                    expect(request.statusCode).toBe(202);
                    expect(request.json()).toEqual({ accepted: true });
                    const token = magicLinkToken(await inbox.nextMessage());

                    const verified = await server.post("/v0/auth/magic-link/verify", { token });
                    expect(verified.statusCode).toBe(200);
                    const bearer = tokenClient(server, verified.json().token as string);
                    expect((await bearer.get("/v0/me")).statusCode).toBe(401);
                    expect((await bearer.get("/v0/auth/session")).statusCode).toBe(401);
                    expect(
                        (
                            await bearer.post("/v0/me/createProfile", {
                                firstName: "Magic",
                                username: "magic_link_member",
                                email,
                            })
                        ).statusCode,
                    ).toBe(201);
                    expect((await bearer.get("/v0/me")).json().user).toMatchObject({
                        username: "magic_link_member",
                        role: "member",
                    });

                    // A link is a one-time credential, including after its profile exists.
                    expect(
                        (await server.post("/v0/auth/magic-link/verify", { token })).json(),
                    ).toEqual({
                        error: "invalid_magic_link",
                    });
                    const userId = (await bearer.get("/v0/me")).json().user.id as string;
                    expect(
                        (await asAdmin.post(`/v0/admin/users/${userId}/banUser`)).statusCode,
                    ).toBe(200);
                    expect((await bearer.get("/v0/me")).statusCode).toBe(401);
                } finally {
                    await inbox.close();
                }
            },
        );
    });

    it("discovers OIDC, binds callback state once, and activates the verified identity as a profile", async () => {
        const provider = await createOidcProvider();
        await withEnvironment({ GYM_OIDC_CLIENT_SECRET: "gym-oidc-secret" }, async () => {
            try {
                await using server = await createGymServer({
                    configure(config) {
                        config.auth.oidc.set("gym", {
                            id: "gym",
                            discoveryUrl: provider.discoveryUrl,
                            clientId: "gym-client",
                            clientSecretEnv: "GYM_OIDC_CLIENT_SECRET",
                            scopes: ["openid", "email"],
                            redirectPath: "/v0/auth/oidc/gym/callback",
                        });
                    },
                });
                expect((await server.get("/v0/auth/methods")).json()).toEqual({
                    role: "all",
                    method: "oidc",
                    oidcProvider: "gym",
                    registration: "bootstrap",
                });
                expect((await server.get("/v0/auth/oidc/missing/start")).statusCode).toBe(404);

                provider.setIdentity("oidc-bootstrap-subject", "oidc.bootstrap@example.com");
                const bootstrapOidc = await completeOidcLogin(server, provider);
                const authorization = bootstrapOidc.authorization;
                expect(authorization.origin).toBe(provider.origin);
                expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
                expect(bootstrapOidc.state).toEqual(expect.any(String));
                expect(bootstrapOidc.callback.statusCode).toBe(200);
                const admin = tokenClient(server, bootstrapOidc.callback.json().token as string);
                const adminProfile = await admin.post("/v0/me/createProfile", {
                    firstName: "OIDC",
                    username: "oidc_bootstrap_admin",
                    email: "oidc.bootstrap@example.com",
                });
                expect(adminProfile.statusCode).toBe(201);
                expect(adminProfile.json().user.role).toBe("admin");

                provider.setIdentity("oidc-member-subject", "oidc.member@example.com");
                const blocked = await completeOidcLogin(server, provider);
                expect(blocked.callback.statusCode).toBe(403);
                expect(blocked.callback.json()).toEqual({ error: "registration_closed" });

                await server.completeSetup({
                    actorUserId: adminProfile.json().user.id as string,
                    registrationEnabled: true,
                });
                const memberOidc = await completeOidcLogin(server, provider);
                expect(memberOidc.callback.statusCode).toBe(200);
                const member = tokenClient(server, memberOidc.callback.json().token as string);
                expect((await member.get("/v0/me")).statusCode).toBe(401);
                expect(
                    (
                        await member.post("/v0/me/createProfile", {
                            firstName: "OIDC",
                            username: "oidc_member",
                            email: "oidc.member@example.com",
                        })
                    ).statusCode,
                ).toBe(201);
                expect((await member.get("/v0/me")).json().user).toMatchObject({
                    username: "oidc_member",
                    email: "oidc.member@example.com",
                    role: "member",
                });
                expect(
                    (
                        await server.get(
                            `/v0/auth/oidc/gym/callback?code=gym-code&state=${encodeURIComponent(memberOidc.state)}`,
                        )
                    ).json(),
                ).toEqual({ error: "invalid_oidc_state" });
            } finally {
                await provider.close();
            }
        });
    });

    it("keeps private profile fields admin-only and makes administrative user controls durable", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            username: "accounts_admin",
            email: "accounts-admin@example.com",
        });
        const member = await server.createUser({
            username: "accounts_member",
            email: "accounts-member@example.com",
            phone: "+1 555 0101",
        });
        const victim = await server.createUser({
            username: "accounts_victim",
            email: "accounts-victim@example.com",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const asVictim = server.as(victim);

        expect((await asMember.get("/v0/admin/users")).statusCode).toBe(403);
        expect(
            (await asMember.post(`/v0/admin/users/${victim.id}/updateUser`, { title: "Nope" }))
                .statusCode,
        ).toBe(403);
        expect((await asMember.get("/v0/me")).statusCode).toBe(200);
        const contact = (await asMember.get("/v0/contacts"))
            .json()
            .users.find((user: { id: string }) => user.id === member.id);
        expect(contact).toMatchObject({ id: member.id, username: "accounts_member" });
        expect(contact).not.toHaveProperty("email");
        expect(contact).not.toHaveProperty("phone");
        expect(contact).not.toHaveProperty("lastAccessAt");

        const administration = await asAdmin.get("/v0/admin/users");
        expect(administration.statusCode).toBe(200);
        expect(
            administration.json().users.find((user: { id: string }) => user.id === member.id),
        ).toMatchObject({
            id: member.id,
            email: "accounts-member@example.com",
            lastAccessAt: expect.any(String),
        });
        const promoted = await asAdmin.post(`/v0/admin/users/${member.id}/updateUser`, {
            title: "Incident Commander",
            role: "admin",
        });
        expect(promoted.statusCode).toBe(200);
        expect(promoted.json().user).toMatchObject({
            id: member.id,
            title: "Incident Commander",
            role: "admin",
        });
        expect((await asMember.get("/v0/me")).json().user).toMatchObject({
            title: "Incident Commander",
            role: "admin",
        });
        expect(
            (await asAdmin.post(`/v0/admin/users/${admin.id}/updateUser`, { role: "member" }))
                .statusCode,
        ).toBe(400);
        expect((await asAdmin.post(`/v0/admin/users/${admin.id}/banUser`)).statusCode).toBe(400);

        expect((await asAdmin.post(`/v0/admin/users/${victim.id}/banUser`)).statusCode).toBe(200);
        expect((await asVictim.get("/v0/me")).statusCode).toBe(401);
        expect(
            (await asAdmin.get("/v0/admin/users"))
                .json()
                .users.find((user: { id: string }) => user.id === victim.id),
        ).toMatchObject({ id: victim.id, bannedAt: expect.any(String) });
        expect((await asAdmin.post(`/v0/admin/users/${victim.id}/unbanUser`)).statusCode).toBe(200);
        // Unbanning restores login eligibility, not a session deliberately revoked by the ban.
        expect((await asVictim.get("/v0/me")).statusCode).toBe(401);
        expect((await asAdmin.post(`/v0/admin/users/${victim.id}/deleteUser`)).statusCode).toBe(
            200,
        );
        await server.restart();
        expect((await asVictim.get("/v0/me")).statusCode).toBe(401);
        expect(
            (await asAdmin.get("/v0/contacts")).json().users.map((user: { id: string }) => user.id),
        ).not.toContain(victim.id);
        expect(
            (await asAdmin.get("/v0/admin/users"))
                .json()
                .users.find((user: { id: string }) => user.id === victim.id),
        ).toMatchObject({ id: victim.id, deletedAt: expect.any(String) });
        expect((await asAdmin.post(`/v0/admin/users/${admin.id}/deleteUser`)).statusCode).toBe(400);
    });

    it("reports repeated profile creation as a conflict", async () => {
        await withEnvironment(
            { HAPPY2_PASSWORD_PEPPER: "gym-auth-profile-conflict-pepper" },
            async () => {
                await using server = await createGymServer({
                    configure(config) {
                        config.auth.password.enabled = true;
                    },
                });
                const registered = await server.post("/v0/auth/password/register", {
                    email: "profile-retry@example.com",
                    password: "correct horse battery staple",
                });
                const bearer = tokenClient(server, registered.json().token as string);
                const payload = {
                    firstName: "Retry",
                    username: "profile_retry",
                    email: "profile-retry@example.com",
                };
                expect((await bearer.post("/v0/me/createProfile", payload)).statusCode).toBe(201);

                // A profile already attached to this account is a clear conflict.
                const duplicate = await bearer.post("/v0/me/createProfile", payload);
                expect(duplicate.statusCode).toBe(409);
                expect(duplicate.json()).toEqual({ error: "profile_exists_or_username_taken" });
            },
        );
    });

    it("reports a duplicate profile username as a conflict", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "username_collision_owner" });
        const contender = await server.createUser({ username: "username_collision_contender" });
        const duplicate = await server.as(contender).post("/v0/me/updateProfile", {
            firstName: contender.firstName,
            lastName: contender.lastName,
            username: owner.username,
            email: contender.email,
            phone: contender.phone,
        });

        // The documented username conflict response is stable across profile mutations.
        expect(duplicate.statusCode).toBe(409);
        expect(duplicate.json()).toEqual({ error: "username_taken" });
    });
});

function tokenClient(server: GymServer, token: string) {
    const request = (options: InjectOptions) =>
        server.request({
            ...options,
            headers: { ...options.headers, authorization: `Bearer ${token}` },
        });
    return {
        get(url: string, options: RequestOptions = {}) {
            return request({ ...options, method: "GET", url });
        },
        post(url: string, payload?: InjectOptions["payload"], options: RequestOptions = {}) {
            return request({ ...options, method: "POST", url, payload });
        },
    };
}

async function completeOidcLogin(server: GymServer, provider: OidcProvider) {
    const start = await server.get("/v0/auth/oidc/gym/start");
    expect(start.statusCode).toBe(302);
    const authorization = new URL(start.headers.location as string);
    const state = authorization.searchParams.get("state");
    if (!state) throw new Error("OIDC authorization did not contain state");
    provider.setExpectedNonce(authorization.searchParams.get("nonce"));
    const callback = await server.get(
        `/v0/auth/oidc/gym/callback?code=gym-code&state=${encodeURIComponent(state)}`,
    );
    return { authorization, state, callback };
}

async function withEnvironment(
    values: Record<string, string>,
    run: () => Promise<void>,
): Promise<void> {
    const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    try {
        await run();
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

interface SmtpInbox {
    port: number;
    nextMessage(): Promise<string>;
    pendingMessages(): number;
    close(): Promise<void>;
}

async function createSmtpInbox(): Promise<SmtpInbox> {
    const messages: string[] = [];
    const waiters: Array<(message: string) => void> = [];
    const sockets = new Set<Socket>();
    const server = createNetServer((socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        socket.setEncoding("utf8");
        socket.write("220 gym.invalid ESMTP\r\n");
        let buffered = "";
        let receivingData = false;
        let message = "";
        let loginStep = 0;
        socket.on("data", (chunk: string) => {
            buffered += chunk;
            for (;;) {
                const lineEnd = buffered.indexOf("\r\n");
                if (lineEnd === -1) return;
                const line = buffered.slice(0, lineEnd);
                buffered = buffered.slice(lineEnd + 2);
                if (receivingData) {
                    if (line === ".") {
                        receivingData = false;
                        const waiter = waiters.shift();
                        if (waiter) waiter(message);
                        else messages.push(message);
                        message = "";
                        socket.write("250 2.0.0 queued\r\n");
                    } else message += `${line}\r\n`;
                    continue;
                }
                if (/^(EHLO|HELO) /i.test(line)) {
                    socket.write(
                        "250-gym.invalid\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n",
                    );
                } else if (/^AUTH PLAIN(?: |$)/i.test(line)) {
                    socket.write("235 2.7.0 authenticated\r\n");
                } else if (/^AUTH LOGIN$/i.test(line)) {
                    loginStep = 1;
                    socket.write("334 VXNlcm5hbWU6\r\n");
                } else if (loginStep === 1) {
                    loginStep = 2;
                    socket.write("334 UGFzc3dvcmQ6\r\n");
                } else if (loginStep === 2) {
                    loginStep = 0;
                    socket.write("235 2.7.0 authenticated\r\n");
                } else if (/^MAIL FROM:/i.test(line) || /^RCPT TO:/i.test(line)) {
                    socket.write("250 2.1.0 accepted\r\n");
                } else if (/^DATA$/i.test(line)) {
                    receivingData = true;
                    socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
                } else if (/^QUIT$/i.test(line)) {
                    socket.end("221 2.0.0 bye\r\n");
                } else socket.write("250 2.0.0 accepted\r\n");
            }
        });
    });
    await listen(server);
    const address = server.address() as AddressInfo;
    return {
        port: address.port,
        nextMessage() {
            const existing = messages.shift();
            if (existing !== undefined) return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("Timed out waiting for magic-link email")),
                    5_000,
                );
                waiters.push((message) => {
                    clearTimeout(timeout);
                    resolve(message);
                });
            });
        },
        pendingMessages: () => messages.length,
        async close() {
            for (const socket of sockets) socket.destroy();
            await closeServer(server);
        },
    };
}

function magicLinkToken(message: string): string {
    const decoded = message.replace(/=\r?\n/g, "").replace(/=3D/gi, "=");
    const match = decoded.match(/token=([A-Za-z0-9_-]+)/);
    if (!match) throw new Error(`Magic-link email did not contain a token: ${decoded}`);
    return match[1]!;
}

interface OidcProvider {
    origin: string;
    discoveryUrl: string;
    setExpectedNonce(value: string | null): void;
    setIdentity(subject: string, email: string): void;
    close(): Promise<void>;
}

async function createOidcProvider(): Promise<OidcProvider> {
    const keys = generateKeyPairSync("rsa", {
        modulusLength: 2048,
    });
    const publicJwk = (keys.publicKey as KeyObject).export({ format: "jwk" });
    let expectedNonce: string | undefined;
    let identitySubject = "oidc-subject";
    let identityEmail = "oidc.member@example.com";
    let origin = "";
    const server = createHttpServer(async (request, response) => {
        const url = new URL(request.url ?? "/", origin);
        if (url.pathname === "/.well-known/openid-configuration") {
            sendJson(response, {
                authorization_endpoint: `${origin}/authorize`,
                token_endpoint: `${origin}/token`,
                jwks_uri: `${origin}/jwks`,
                issuer: origin,
            });
            return;
        }
        if (url.pathname === "/jwks") {
            sendJson(response, {
                keys: [{ ...publicJwk, kid: "gym-key", use: "sig", alg: "RS256" }],
            });
            return;
        }
        if (url.pathname === "/token" && request.method === "POST") {
            for await (const _chunk of request) {
                // Consume the form body. The provider intentionally accepts the checked gym code.
            }
            sendJson(response, {
                id_token: signIdentityToken(keys.privateKey as KeyObject, {
                    iss: origin,
                    aud: "gym-client",
                    sub: identitySubject,
                    email: identityEmail,
                    email_verified: true,
                    nonce: expectedNonce,
                    iat: Math.floor(Date.now() / 1_000),
                    exp: Math.floor(Date.now() / 1_000) + 300,
                }),
            });
            return;
        }
        response.statusCode = 200;
        response.end("OIDC gym provider");
    });
    await listen(server);
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
    return {
        origin,
        discoveryUrl: `${origin}/.well-known/openid-configuration`,
        setExpectedNonce(value) {
            expectedNonce = value ?? undefined;
        },
        setIdentity(subject, email) {
            identitySubject = subject;
            identityEmail = email;
        },
        close: () => closeServer(server),
    };
}

function signIdentityToken(privateKey: KeyObject, payload: Record<string, unknown>): string {
    const header = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "gym-key", typ: "JWT" }),
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const input = `${header}.${body}`;
    const signer = createSign("RSA-SHA256");
    signer.update(input);
    signer.end();
    return `${input}.${signer.sign(privateKey).toString("base64url")}`;
}

function sendJson(response: import("node:http").ServerResponse, value: unknown): void {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(value));
}

async function listen(server: NetServer | HttpServer): Promise<void> {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
}

async function closeServer(server: NetServer | HttpServer): Promise<void> {
    if (!server.listening) return;
    server.close();
    await once(server, "close");
}
