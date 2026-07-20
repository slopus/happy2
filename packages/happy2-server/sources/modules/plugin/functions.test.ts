import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DrizzleExecutor } from "../drizzle.js";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { pluginFunctionResultAcquire } from "./pluginFunctionResultAcquire.js";
import { pluginFunctionResultComplete } from "./pluginFunctionResultComplete.js";
import { pluginFunctionResultRenewLease } from "./pluginFunctionResultRenewLease.js";

describe("durable plugin function results", () => {
    let client: Client;
    let directory: string;
    let executor: DrizzleExecutor;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-plugin-function-test-"));
        client = createClient({ url: `file:${join(directory, "happy2.db")}` });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
    });

    afterEach(async () => {
        client.close();
        await rm(directory, { recursive: true });
    });

    it("admits one live executor and replays its terminal result", async () => {
        await expect(
            pluginFunctionResultAcquire(executor, {
                callId: "call-one",
                leaseExpiresAt: 2_000,
                leaseToken: "lease-one",
                now: 1_000,
                sessionId: "session-one",
            }),
        ).resolves.toEqual({ kind: "acquired" });
        await expect(
            pluginFunctionResultAcquire(executor, {
                callId: "call-one",
                leaseExpiresAt: 2_000,
                leaseToken: "lease-two",
                now: 1_000,
                sessionId: "session-one",
            }),
        ).resolves.toEqual({ kind: "in_progress", retryAt: 2_000 });
        const result = {
            status: "completed" as const,
            output: { content: [{ type: "text", text: "Hello" }] },
        };
        await expect(
            pluginFunctionResultComplete(executor, {
                callId: "call-one",
                leaseToken: "lease-one",
                result,
                sessionId: "session-one",
            }),
        ).resolves.toEqual(result);
        await expect(
            pluginFunctionResultAcquire(executor, {
                callId: "call-one",
                leaseExpiresAt: 3_000,
                leaseToken: "lease-three",
                now: 2_000,
                sessionId: "session-one",
            }),
        ).resolves.toEqual({ kind: "replay", result });
    });

    it("fences an executor whose expired lease was taken over", async () => {
        await pluginFunctionResultAcquire(executor, {
            callId: "call-two",
            leaseExpiresAt: 2_000,
            leaseToken: "expired-lease",
            now: 1_000,
            sessionId: "session-two",
        });
        await expect(
            pluginFunctionResultAcquire(executor, {
                callId: "call-two",
                leaseExpiresAt: 4_000,
                leaseToken: "replacement-lease",
                now: 2_001,
                sessionId: "session-two",
            }),
        ).resolves.toEqual({ kind: "acquired" });
        await expect(
            pluginFunctionResultComplete(executor, {
                callId: "call-two",
                leaseToken: "expired-lease",
                result: { status: "completed", output: "late" },
                sessionId: "session-two",
            }),
        ).rejects.toThrow("lease was lost");
        await expect(
            pluginFunctionResultComplete(executor, {
                callId: "call-two",
                leaseToken: "replacement-lease",
                result: { status: "failed", error: { message: "stable failure" } },
                sessionId: "session-two",
            }),
        ).resolves.toEqual({
            status: "failed",
            error: { message: "stable failure" },
        });
    });

    it("extends and restores only the current executor lease", async () => {
        await pluginFunctionResultAcquire(executor, {
            callId: "call-renewed",
            leaseExpiresAt: 2_000,
            leaseToken: "lease-current",
            now: 1_000,
            sessionId: "session-renewed",
        });
        await expect(
            pluginFunctionResultRenewLease(executor, {
                callId: "call-renewed",
                leaseExpiresAt: 5_000,
                leaseToken: "lease-current",
                sessionId: "session-renewed",
            }),
        ).resolves.toBeUndefined();
        await expect(
            pluginFunctionResultAcquire(executor, {
                callId: "call-renewed",
                leaseExpiresAt: 6_000,
                leaseToken: "lease-contender",
                now: 3_000,
                sessionId: "session-renewed",
            }),
        ).resolves.toEqual({ kind: "in_progress", retryAt: 5_000 });
        await expect(
            pluginFunctionResultRenewLease(executor, {
                callId: "call-renewed",
                leaseExpiresAt: 7_000,
                leaseToken: "lease-contender",
                sessionId: "session-renewed",
            }),
        ).rejects.toThrow("lease was lost");
        await expect(
            pluginFunctionResultRenewLease(executor, {
                callId: "call-renewed",
                leaseExpiresAt: 3_500,
                leaseToken: "lease-current",
                sessionId: "session-renewed",
            }),
        ).resolves.toBeUndefined();
    });

    it("linearizes simultaneous claims from separate database connections", async () => {
        const sharedDirectory = await mkdtemp(join(tmpdir(), "happy2-plugin-functions-"));
        const url = `file:${join(sharedDirectory, "happy2.db")}`;
        const firstClient = createClient({ url });
        const secondClient = createClient({ url });
        try {
            await serverSchemaMigrate(firstClient);
            const claims = await Promise.all([
                pluginFunctionResultAcquire(createDatabase(firstClient), {
                    callId: "call-shared",
                    leaseExpiresAt: 2_000,
                    leaseToken: "lease-first",
                    now: 1_000,
                    sessionId: "session-shared",
                }),
                pluginFunctionResultAcquire(createDatabase(secondClient), {
                    callId: "call-shared",
                    leaseExpiresAt: 2_000,
                    leaseToken: "lease-second",
                    now: 1_000,
                    sessionId: "session-shared",
                }),
            ]);
            expect(claims).toEqual(
                expect.arrayContaining([
                    { kind: "acquired" },
                    { kind: "in_progress", retryAt: 2_000 },
                ]),
            );
        } finally {
            firstClient.close();
            secondClient.close();
            await rm(sharedDirectory, { recursive: true });
        }
    });
});
