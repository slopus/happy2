import { createSign, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import type { InjectOptions } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("Cloudflare Access headers authenticate profiles", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("validates the signed application assertion, activates profiles, and respects local bans", async () => {
        const teamDomain = `https://gym-${randomUUID()}.cloudflareaccess.com`;
        const audience = "gym-cloudflare-access-audience";
        const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const publicJwk = (keys.publicKey as KeyObject).export({ format: "jwk" });
        const fetch = globalThis.fetch;
        vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === `${teamDomain}/cdn-cgi/access/certs`)
                return new Response(
                    JSON.stringify({
                        keys: [
                            {
                                ...publicJwk,
                                kid: "gym-cloudflare-access",
                                use: "sig",
                                alg: "RS256",
                            },
                        ],
                    }),
                    { headers: { "content-type": "application/json" } },
                );
            return fetch(input, init);
        });

        await using server = await createGymServer({
            configure(config) {
                config.auth.cloudflareAccess = { enabled: true, teamDomain, audience };
            },
        });
        const admin = await server.createUser({ username: "cloudflare_access_admin" });
        const assertion = accessAssertion(keys.privateKey as KeyObject, {
            iss: teamDomain,
            aud: [audience],
            type: "app",
            sub: "cloudflare-access-subject",
            email: "access.member@example.com",
            exp: Math.floor(Date.now() / 1_000) + 300,
        });
        const access = headerClient(server, assertion);

        expect((await server.get("/v0/auth/methods")).json()).toEqual({
            role: "all",
            method: "cloudflare_access",
        });
        expect((await server.get("/v0/me")).statusCode).toBe(401);
        expect((await access.get("/v0/me")).statusCode).toBe(401);

        const profile = await access.post("/v0/me/createProfile", {
            firstName: "Access",
            username: "access_member",
            email: "access.member@example.com",
        });
        expect(profile.statusCode).toBe(201);
        const userId = profile.json().user.id as string;
        expect((await access.get("/v0/me")).json().user).toMatchObject({
            id: userId,
            username: "access_member",
            email: "access.member@example.com",
            role: "member",
        });
        expect((await access.get("/v0/auth/session")).json()).toMatchObject({
            authentication: "cloudflare_access",
            expiresAt: expect.any(String),
        });
        expect((await access.post("/v0/auth/refresh")).statusCode).toBe(401);
        expect((await access.post("/v0/auth/logout")).json()).toEqual({
            error: "cloudflare_access_manages_session",
        });

        const wrongAudience = headerClient(
            server,
            accessAssertion(keys.privateKey as KeyObject, {
                iss: teamDomain,
                aud: ["different-access-application"],
                type: "app",
                sub: "cloudflare-access-subject",
                email: "access.member@example.com",
                exp: Math.floor(Date.now() / 1_000) + 300,
            }),
        );
        expect((await wrongAudience.get("/v0/me")).statusCode).toBe(401);
        expect((await headerClient(server, `${assertion}corrupted`).get("/v0/me")).statusCode).toBe(
            401,
        );

        expect((await server.as(admin).post(`/v0/admin/users/${userId}/banUser`)).statusCode).toBe(
            200,
        );
        expect((await access.get("/v0/me")).statusCode).toBe(401);
    });
});

function headerClient(server: Awaited<ReturnType<typeof createGymServer>>, assertion: string) {
    return {
        get(url: string) {
            return server.get(url, { headers: { "cf-access-jwt-assertion": assertion } });
        },
        post(url: string, payload?: InjectOptions["payload"]) {
            return server.post(url, payload, {
                headers: { "cf-access-jwt-assertion": assertion },
            });
        },
    };
}

function accessAssertion(privateKey: KeyObject, payload: Record<string, unknown>): string {
    const header = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "gym-cloudflare-access", typ: "JWT" }),
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const input = `${header}.${body}`;
    const signer = createSign("RSA-SHA256");
    signer.update(input);
    signer.end();
    return `${input}.${signer.sign(privateKey).toString("base64url")}`;
}
