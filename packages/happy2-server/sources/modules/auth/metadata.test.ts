import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { bearerToken } from "./metadata.js";

describe("bearerToken", () => {
    it("does not truncate long asymmetric JWTs", () => {
        const token = "x".repeat(800);
        const request = { headers: { authorization: `Bearer ${token}` } } as FastifyRequest;
        expect(bearerToken(request)).toBe(token);
    });
});
