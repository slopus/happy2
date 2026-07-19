import type { InjectOptions } from "fastify";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("configured dev tokens export session auth and follow its revocation", () => {
    it("keeps the capability and creation route disabled by default", async () => {
        await using server = await createGymServer();
        const user = await server.createUser({ username: "disabled_dev_tokens" });

        expect((await server.get("/v0/auth/methods")).json()).toMatchObject({
            devTokensEnabled: false,
        });
        expect((await server.as(user).post("/v0/me/createDevToken")).statusCode).toBe(404);
        expect((await bearer(server, "happy2_dev_not_enabled").get("/v0/me")).statusCode).toBe(401);
    });

    it("exports one session, survives restart, obeys config, and stops at session revocation", async () => {
        await using server = await createGymServer({
            configure(config) {
                config.auth.devTokens.enabled = true;
            },
        });
        const user = await server.createUser({ username: "enabled_dev_tokens" });
        const asUser = server.as(user);
        const session = await asUser.get("/v0/auth/session");

        expect((await server.get("/v0/auth/methods")).json()).toMatchObject({
            devTokensEnabled: true,
        });
        expect((await server.post("/v0/me/createDevToken")).statusCode).toBe(401);

        const created = await asUser.post("/v0/me/createDevToken", undefined, {
            headers: {
                "user-agent": "happy2-gym-dev-token",
                "x-happy2-device": "gym-desktop",
                "x-happy2-app-version": "0.0.3-gym",
            },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({
            token: expect.stringMatching(/^happy2_dev_[A-Za-z0-9_-]{43}$/),
            sessionId: session.json().sessionId,
            expiresAt: session.json().expiresAt,
        });
        const token = created.json().token as string;
        const asDevelopment = bearer(server, token);
        expect((await asDevelopment.get("/v0/me")).json().user).toMatchObject({ id: user.id });
        expect((await cookie(server, token).get("/v0/me")).json().user).toMatchObject({
            id: user.id,
        });
        expect((await cookie(server, user.token).get("/v0/me")).statusCode).toBe(200);
        expect((await asDevelopment.get("/v0/auth/session")).json()).toMatchObject({
            sessionId: session.json().sessionId,
            expiresAt: session.json().expiresAt,
        });
        expect((await bearer(server, `${token.slice(0, -1)}x`).get("/v0/me")).statusCode).toBe(401);
        expect((await cookie(server, `${token.slice(0, -1)}x`).get("/v0/me")).statusCode).toBe(401);

        await server.restart();
        expect((await asDevelopment.get("/v0/me")).statusCode).toBe(200);

        server.config.auth.devTokens.enabled = false;
        await server.restart();
        expect((await server.get("/v0/auth/methods")).json()).toMatchObject({
            devTokensEnabled: false,
        });
        expect((await asDevelopment.get("/v0/me")).statusCode).toBe(401);
        expect((await cookie(server, token).get("/v0/me")).statusCode).toBe(401);
        expect((await asUser.post("/v0/me/createDevToken")).statusCode).toBe(404);

        server.config.auth.devTokens.enabled = true;
        await server.restart();
        expect((await asDevelopment.get("/v0/me")).statusCode).toBe(200);
        expect((await asUser.post("/v0/auth/logout")).statusCode).toBe(204);
        expect((await asDevelopment.get("/v0/me")).statusCode).toBe(401);
    });

    it("validates a shared dev token on an API-only server without exposing issuance there", async () => {
        await using authServer = await createGymServer({
            databaseMode: "file",
            configure(config) {
                config.server.role = "auth";
                config.auth.devTokens.enabled = true;
            },
        });
        const user = await authServer.createUser({ username: "split_dev_tokens" });
        const created = await authServer.as(user).post("/v0/me/createDevToken");
        const token = created.json().token as string;

        await using apiServer = await createGymServer({
            databaseUrl: authServer.config.database.url,
            configure(config) {
                config.server.role = "api";
                config.auth.devTokens.enabled = true;
            },
        });
        expect((await apiServer.get("/v0/auth/methods")).json()).toMatchObject({
            role: "api",
            devTokensEnabled: false,
        });
        expect((await bearer(apiServer, token).get("/v0/me")).json().user).toMatchObject({
            id: user.id,
        });
        expect((await bearer(apiServer, token).post("/v0/me/createDevToken")).statusCode).toBe(404);
    });
});

function bearer(server: GymRequestClient, token: string): GymRequestClient {
    const request = (options: InjectOptions) =>
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

function cookie(server: GymRequestClient, token: string): GymRequestClient {
    const request = (options: InjectOptions) =>
        server.request({
            ...options,
            headers: { ...options.headers, cookie: `happy2_auth_token=${token}` },
        });
    return {
        request,
        get: (url, options = {}) => request({ ...options, method: "GET", url }),
        post: (url, payload, options = {}) => request({ ...options, method: "POST", url, payload }),
    };
}
