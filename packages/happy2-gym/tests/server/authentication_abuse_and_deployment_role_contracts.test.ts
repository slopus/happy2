import { describe, expect, it } from "vitest";
import { createGymServer, type GymServer } from "../../sources/index.js";

describe("authentication abuse protection and deployment role contracts", () => {
    it("limits password registration and login without allowing forwarded-header bypasses, then resets locally on restart", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                    config.security.rateLimit.authPerMinute = 2;
                },
            });
            const password = "correct horse battery staple";
            const email = "abuse-protection@example.com";

            const invalidRegistration = await server.post(
                "/v0/auth/password/register",
                { email: "not-an-email", password },
                { headers: { "x-forwarded-for": "198.51.100.10" } },
            );
            expect(invalidRegistration.statusCode).toBe(400);
            expect(invalidRegistration.json()).toEqual({ error: "invalid_credentials" });
            expect(invalidRegistration.headers["ratelimit-limit"]).toBe("2");
            expect(invalidRegistration.headers["ratelimit-remaining"]).toBe("1");
            const registration = await server.post(
                "/v0/auth/password/register",
                { email, password },
                { headers: { "x-forwarded-for": "198.51.100.11" } },
            );
            expect(registration.statusCode).toBe(201);
            expect(registration.headers["ratelimit-remaining"]).toBe("0");
            const limitedRegistration = await server.post(
                "/v0/auth/password/register",
                { email: "different-registration@example.com", password },
                { headers: { "x-forwarded-for": "198.51.100.12" } },
            );
            expect(limitedRegistration.statusCode).toBe(429);
            expect(limitedRegistration.json()).toMatchObject({
                error: "rate_limited",
                retryAfterSeconds: expect.any(Number),
            });
            expect(limitedRegistration.headers["retry-after"]).toMatch(/^\d+$/);

            // Unknown and known accounts deliberately receive identical credential failures.
            const unknownCredentials = await server.post(
                "/v0/auth/password/login",
                { email: "missing-account@example.com", password },
                { headers: { "x-forwarded-for": "198.51.100.20" } },
            );
            const knownWrongCredentials = await server.post(
                "/v0/auth/password/login",
                { email, password: "definitely the wrong password" },
                { headers: { "x-forwarded-for": "198.51.100.21" } },
            );
            expect(unknownCredentials.statusCode).toBe(401);
            expect(knownWrongCredentials.statusCode).toBe(401);
            expect(unknownCredentials.json()).toEqual({ error: "invalid_credentials" });
            expect(knownWrongCredentials.json()).toEqual(unknownCredentials.json());
            const limitedLogin = await server.post(
                "/v0/auth/password/login",
                { email, password },
                { headers: { "x-forwarded-for": "198.51.100.22" } },
            );
            expect(limitedLogin.statusCode).toBe(429);
            expect(limitedLogin.headers["ratelimit-limit"]).toBe("2");
            expect(limitedLogin.headers["ratelimit-remaining"]).toBe("0");

            // `trusted_proxy_hops = 0` is the safe default: changing an untrusted
            // forwarded header does not create a new bucket. Restarting does reset
            // the documented process-local limiter without losing registered accounts.
            await server.restart();
            const loginAfterRestart = await server.post(
                "/v0/auth/password/login",
                { email, password },
                { headers: { "x-forwarded-for": "203.0.113.9" } },
            );
            expect(loginAfterRestart.statusCode).toBe(200);
            expect(loginAfterRestart.json()).toMatchObject({
                token: expect.any(String),
                expiresAt: expect.any(String),
            });
        });
    });

    it("honors forwarded client addresses only when the configured proxy boundary permits them", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                    config.server.trustedProxyHops = 1;
                    config.security.rateLimit.authPerMinute = 1;
                },
            });
            const payload = {
                email: "trusted-proxy-missing@example.com",
                password: "correct horse battery staple",
            };
            const firstAddress = await server.post("/v0/auth/password/login", payload, {
                headers: { "x-forwarded-for": "198.51.100.50" },
            });
            const secondAddress = await server.post("/v0/auth/password/login", payload, {
                headers: { "x-forwarded-for": "198.51.100.51" },
            });
            const repeatedFirstAddress = await server.post("/v0/auth/password/login", payload, {
                headers: { "x-forwarded-for": "198.51.100.50" },
            });
            expect(firstAddress.statusCode).toBe(401);
            expect(secondAddress.statusCode).toBe(401);
            expect(repeatedFirstAddress.statusCode).toBe(429);
        });
    });

    it("exposes only the appropriate issuance and product surfaces for auth and api deployments", async () => {
        await withPasswordPepper(async () => {
            await using authServer = await createGymServer({
                configure(config) {
                    config.server.role = "auth";
                    config.auth.password.enabled = true;
                },
            });
            expect((await authServer.get("/v0/auth/methods")).json()).toEqual({
                role: "auth",
                method: "password",
                devTokensEnabled: false,
                signupEnabled: true,
                registration: "bootstrap",
            });
            const registration = await authServer.post("/v0/auth/password/register", {
                email: "auth-service@example.com",
                password: "correct horse battery staple",
            });
            expect(registration.statusCode).toBe(201);
            const token = registration.json().token as string;
            const profile = await postWithBearer(authServer, token, "/v0/me/createProfile", {
                firstName: "Auth Service",
                username: "auth_service_member",
                email: "auth-service@example.com",
            });
            expect(profile.statusCode).toBe(201);
            expect((await getWithBearer(authServer, token, "/v0/auth/session")).statusCode).toBe(
                200,
            );
            expect((await getWithBearer(authServer, token, "/v0/me")).statusCode).toBe(404);
            expect((await getWithBearer(authServer, token, "/v0/chats")).statusCode).toBe(404);
        });

        await using apiServer = await createGymServer({
            configure(config) {
                config.server.role = "api";
            },
        });
        const apiUser = await apiServer.createUser({ username: "api_role_member" });
        expect((await apiServer.get("/v0/auth/methods")).json()).toEqual({
            role: "api",
            method: null,
            devTokensEnabled: false,
            registration: "open",
        });
        expect((await apiServer.post("/v0/auth/password/register", {})).statusCode).toBe(404);
        expect((await apiServer.as(apiUser).post("/v0/me/createProfile", {})).statusCode).toBe(404);
        expect((await apiServer.as(apiUser).post("/v0/auth/refresh")).statusCode).toBe(404);
        expect((await apiServer.as(apiUser).post("/v0/auth/logout")).statusCode).toBe(404);
        expect((await apiServer.as(apiUser).get("/v0/auth/session")).statusCode).toBe(200);
        expect((await apiServer.as(apiUser).get("/v0/me")).statusCode).toBe(200);
        expect((await apiServer.as(apiUser).get("/v0/chats")).statusCode).toBe(200);
    });
});

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-auth-abuse-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}

function getWithBearer(server: GymServer, token: string, url: string) {
    return server.get(url, { headers: { authorization: `Bearer ${token}` } });
}

function postWithBearer(
    server: GymServer,
    token: string,
    url: string,
    payload?: Parameters<GymServer["post"]>[1],
) {
    return server.post(url, payload, { headers: { authorization: `Bearer ${token}` } });
}
