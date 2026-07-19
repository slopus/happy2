import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { authenticationCookie, bearerToken } from "./metadata.js";

describe("bearerToken", () => {
    it("does not truncate long asymmetric JWTs", () => {
        const token = "x".repeat(800);
        const request = { headers: { authorization: `Bearer ${token}` } } as FastifyRequest;
        expect(bearerToken(request)).toBe(token);
    });
});

describe("authenticationCookie", () => {
    it("reads only the exact web authentication cookie", () => {
        const token = "happy2_dev_cookie-token";
        const request = {
            headers: { cookie: `other=value; happy2_auth_token=${token}; another=value` },
        } as FastifyRequest;
        expect(authenticationCookie(request)).toBe(token);
    });

    it("does not treat other cookies or oversized values as authentication credentials", () => {
        expect(
            authenticationCookie({
                headers: { cookie: "token=happy2_dev_not-this-cookie" },
            } as FastifyRequest),
        ).toBeUndefined();
        expect(
            authenticationCookie({
                headers: { cookie: `happy2_auth_token=${"x".repeat(4_097)}` },
            } as FastifyRequest),
        ).toBeUndefined();
    });
});
