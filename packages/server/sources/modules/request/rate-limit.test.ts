import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
    createRateLimitHook,
    createRateLimitStorageKey,
    HttpRateLimiter,
    LocalRateLimitStore,
    RateLimitUnavailableError,
    requestRateLimitRules,
    type RateLimitStore,
} from "./rate-limit.js";

describe("LocalRateLimitStore", () => {
    it("enforces and resets a fixed window", async () => {
        const store = new LocalRateLimitStore();
        const input = { key: "messages:ip:digest", limit: 2, windowMs: 1_000 };

        expect(await store.consume({ ...input, now: 100 })).toMatchObject({
            allowed: true,
            remaining: 1,
            resetAt: 1_100,
        });
        expect(await store.consume({ ...input, now: 200 })).toMatchObject({
            allowed: true,
            remaining: 0,
            resetAt: 1_100,
        });
        expect(await store.consume({ ...input, now: 300 })).toMatchObject({
            allowed: false,
            remaining: 0,
            resetAt: 1_100,
            reason: "limit",
        });
        expect(await store.consume({ ...input, now: 1_100 })).toMatchObject({
            allowed: true,
            remaining: 1,
            resetAt: 2_100,
        });
    });

    it("stays bounded, fails closed at capacity, and reclaims expired keys", async () => {
        const store = new LocalRateLimitStore({ maxEntries: 2, cleanupIntervalMs: 10_000 });
        await store.consume({ key: "one", limit: 1, windowMs: 100, now: 0 });
        await store.consume({ key: "two", limit: 1, windowMs: 200, now: 0 });

        expect(
            await store.consume({ key: "three", limit: 1, windowMs: 100, now: 1 }),
        ).toMatchObject({
            allowed: false,
            reason: "store_capacity",
            resetAt: 100,
        });
        expect(store.size).toBe(2);

        expect(
            await store.consume({ key: "three", limit: 1, windowMs: 100, now: 100 }),
        ).toMatchObject({
            allowed: true,
        });
        expect(store.size).toBe(2);
    });
});

describe("HttpRateLimiter", () => {
    it("hashes raw actor and IP identities into independent keys", () => {
        const request = { ip: "203.0.113.9" };
        const rules = requestRateLimitRules(
            request,
            {
                scope: "messages.send",
                ip: { limit: 20, windowMs: 1_000 },
                actor: { limit: 5, windowMs: 1_000 },
            },
            "user_secret",
        );

        expect(rules.map((rule) => rule.dimension)).toEqual(["ip", "actor"]);
        const keys = rules.map(createRateLimitStorageKey);
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toContain("203.0.113.9");
        expect(keys[1]).not.toContain("user_secret");
        expect(keys[0]).not.toBe(keys[1]);
    });

    it("defaults to fail-closed and supports an explicit fail-open policy", async () => {
        const error = new Error("redis unavailable");
        const store: RateLimitStore = { consume: vi.fn().mockRejectedValue(error) };
        const rule = {
            scope: "auth.login",
            dimension: "ip",
            identity: "127.0.0.1",
            limit: 1,
            windowMs: 1_000,
        } as const;

        await expect(new HttpRateLimiter(store).evaluate([rule])).rejects.toBeInstanceOf(
            RateLimitUnavailableError,
        );
        await expect(
            new HttpRateLimiter(store, { failOpen: true }).evaluate([rule]),
        ).resolves.toMatchObject({
            allowed: true,
            bypassedBecauseStoreFailed: true,
        });
    });

    it("uses Fastify's trusted-proxy IP and returns retry metadata", async () => {
        let now = 10_000;
        const limiter = new HttpRateLimiter(new LocalRateLimitStore(), { now: () => now });
        const app = Fastify({ trustProxy: 1 });
        app.post(
            "/v0/action",
            {
                preHandler: createRateLimitHook({
                    limiter,
                    policy: {
                        scope: "test.action",
                        ip: { limit: 1, windowMs: 2_500 },
                    },
                }),
            },
            async () => ({ ok: true }),
        );

        const first = await app.inject({
            method: "POST",
            url: "/v0/action",
            headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(first.statusCode).toBe(200);
        expect(first.headers["ratelimit-remaining"]).toBe("0");

        const limited = await app.inject({
            method: "POST",
            url: "/v0/action",
            headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(limited.statusCode).toBe(429);
        expect(limited.headers["retry-after"]).toBe("3");
        expect(limited.headers["ratelimit-limit"]).toBe("1");
        expect(limited.headers["ratelimit-reset"]).toBe("3");
        expect(limited.json()).toEqual({ error: "rate_limited", retryAfterSeconds: 3 });

        const otherProxyAwareIp = await app.inject({
            method: "POST",
            url: "/v0/action",
            headers: { "x-forwarded-for": "203.0.113.11" },
        });
        expect(otherProxyAwareIp.statusCode).toBe(200);

        now = 12_500;
        const reset = await app.inject({
            method: "POST",
            url: "/v0/action",
            headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(reset.statusCode).toBe(200);
        await app.close();
    });
});
