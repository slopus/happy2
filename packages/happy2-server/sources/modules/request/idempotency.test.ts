import { describe, expect, it, vi } from "vitest";
import {
    createIdempotencyStorageKey,
    createRequestFingerprint,
    fingerprintFastifyRequest,
    IdempotencyCoordinator,
    LocalIdempotencyStore,
} from "./idempotency.js";

interface TestResponse {
    statusCode: number;
    body: { messageId: string };
}

describe("request fingerprints", () => {
    it("canonicalizes object keys and normalizes content types", () => {
        const first = createRequestFingerprint({
            action: "/v0/chats/:chatId/sendMessage",
            contentType: "Application/JSON; charset=utf-8",
            payload: { text: "hello", options: { silent: false, attachments: ["file_1"] } },
        });
        const same = createRequestFingerprint({
            action: "/v0/chats/:chatId/sendMessage",
            contentType: "application/json",
            payload: { options: { attachments: ["file_1"], silent: false }, text: "hello" },
        });
        const changed = createRequestFingerprint({
            action: "/v0/chats/:chatId/sendMessage",
            contentType: "application/json",
            payload: { options: { attachments: ["file_1"], silent: false }, text: "goodbye" },
        });

        expect(first).toBe(same);
        expect(changed).not.toBe(first);
        expect(() =>
            createRequestFingerprint({ action: "action", payload: { invalid: undefined } }),
        ).toThrow("JSON-compatible");
    });

    it("scopes storage keys by actor, action, and client key without exposing them", () => {
        const input = { actorId: "user_private", scope: "messages.send", key: "client-key-1" };
        const key = createIdempotencyStorageKey(input);

        expect(key).toMatch(/^[a-f0-9]{64}$/);
        expect(key).not.toContain(input.actorId);
        expect(createIdempotencyStorageKey({ ...input, actorId: "other" })).not.toBe(key);
        expect(createIdempotencyStorageKey({ ...input, scope: "messages.forward" })).not.toBe(key);
    });

    it("fingerprints concrete resource paths instead of only route templates", () => {
        const request = (url: string) =>
            ({
                body: {},
                headers: { "content-type": "application/json" },
                method: "POST",
                query: {},
                routeOptions: { url: "/v0/messages/:messageId/deleteMessage" },
                url,
            }) as Parameters<typeof fingerprintFastifyRequest>[0];
        expect(fingerprintFastifyRequest(request("/v0/messages/message-a/deleteMessage"))).not.toBe(
            fingerprintFastifyRequest(request("/v0/messages/message-b/deleteMessage")),
        );
    });
});

describe("IdempotencyCoordinator", () => {
    it("executes once, replays the stored response, and conflicts on changed input", async () => {
        let now = 1_000;
        let token = 0;
        const store = new LocalIdempotencyStore<TestResponse>();
        const coordinator = new IdempotencyCoordinator(store, {
            now: () => now,
            leaseToken: () => `lease_${++token}`,
            leaseMs: 1_000,
            retentionMs: 10_000,
        });
        const operation = vi.fn(async () => ({
            statusCode: 201,
            body: { messageId: "message_1" },
        }));
        const input = {
            actorId: "user_1",
            scope: "messages.send",
            key: "mutation-1",
            fingerprint: createRequestFingerprint({
                action: "messages.send",
                payload: { text: "hello" },
            }),
        };

        await expect(coordinator.execute(input, operation)).resolves.toEqual({
            kind: "executed",
            response: { statusCode: 201, body: { messageId: "message_1" } },
        });
        now += 10;
        const replay = await coordinator.execute(input, operation);
        expect(replay).toEqual({
            kind: "replay",
            response: { statusCode: 201, body: { messageId: "message_1" } },
        });
        if (replay.kind === "replay") replay.response.body.messageId = "mutated_by_caller";
        expect(await coordinator.execute(input, operation)).toEqual({
            kind: "replay",
            response: { statusCode: 201, body: { messageId: "message_1" } },
        });
        expect(operation).toHaveBeenCalledTimes(1);

        await expect(
            coordinator.execute(
                {
                    ...input,
                    fingerprint: createRequestFingerprint({
                        action: "messages.send",
                        payload: { text: "changed" },
                    }),
                },
                operation,
            ),
        ).resolves.toEqual({ kind: "conflict" });
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it("reports in-flight work and fences a worker whose lease was replaced", async () => {
        let now = 0;
        let token = 0;
        const coordinator = new IdempotencyCoordinator(new LocalIdempotencyStore<TestResponse>(), {
            now: () => now,
            leaseToken: () => `lease_${++token}`,
            leaseMs: 500,
            retentionMs: 5_000,
        });
        const input = {
            actorId: "user_1",
            scope: "messages.send",
            key: "mutation-2",
            fingerprint: "fingerprint-a",
        };

        const first = await coordinator.begin(input);
        expect(first.kind).toBe("acquired");
        expect(await coordinator.begin(input)).toEqual({ kind: "in_progress", retryAfterMs: 500 });

        now = 500;
        const replacement = await coordinator.begin(input);
        expect(replacement.kind).toBe("acquired");
        if (first.kind !== "acquired" || replacement.kind !== "acquired")
            throw new Error("missing lease");
        expect(
            await coordinator.complete(first.lease, {
                statusCode: 201,
                body: { messageId: "stale" },
            }),
        ).toBe(false);
        expect(
            await coordinator.complete(replacement.lease, {
                statusCode: 201,
                body: { messageId: "current" },
            }),
        ).toBe(true);
        expect(await coordinator.begin(input)).toEqual({
            kind: "replay",
            response: { statusCode: 201, body: { messageId: "current" } },
        });
    });

    it("releases a failed operation so a retry can acquire immediately", async () => {
        let token = 0;
        const coordinator = new IdempotencyCoordinator(new LocalIdempotencyStore<TestResponse>(), {
            leaseToken: () => `lease_${++token}`,
        });
        const input = {
            actorId: "user_1",
            scope: "channels.create",
            key: "mutation-3",
            fingerprint: "fingerprint-b",
        };

        await expect(
            coordinator.execute(input, async () => {
                throw new Error("transaction rolled back");
            }),
        ).rejects.toThrow("transaction rolled back");
        await expect(
            coordinator.execute(input, async () => ({
                statusCode: 201,
                body: { messageId: "channel-created" },
            })),
        ).resolves.toMatchObject({ kind: "executed" });
    });

    it("rejects ambiguous or unbounded client keys", async () => {
        const coordinator = new IdempotencyCoordinator(new LocalIdempotencyStore());
        const base = { actorId: "user", scope: "action", fingerprint: "fingerprint" };
        await expect(coordinator.begin({ ...base, key: "contains a space" })).rejects.toThrow(
            "visible ASCII",
        );
        await expect(coordinator.begin({ ...base, key: "x".repeat(201) })).rejects.toThrow("1-200");
    });
});

describe("LocalIdempotencyStore bounds", () => {
    it("never evicts a live record and reclaims expired records", async () => {
        const store = new LocalIdempotencyStore({ maxEntries: 1, cleanupIntervalMs: 10_000 });
        const first = {
            storageKey: "first",
            fingerprint: "one",
            leaseToken: "lease_one",
            now: 0,
            leaseExpiresAt: 10,
            recordExpiresAt: 100,
        };
        await store.acquire(first);
        await expect(
            store.acquire({
                ...first,
                storageKey: "second",
                leaseToken: "lease_two",
                now: 1,
                leaseExpiresAt: 11,
                recordExpiresAt: 101,
            }),
        ).rejects.toMatchObject({
            name: "IdempotencyStoreCapacityError",
            retryAt: 100,
        });
        expect(store.size).toBe(1);

        await expect(
            store.acquire({
                ...first,
                storageKey: "second",
                leaseToken: "lease_two",
                now: 100,
                leaseExpiresAt: 110,
                recordExpiresAt: 200,
            }),
        ).resolves.toEqual({ kind: "acquired" });
        expect(store.size).toBe(1);
    });
});
