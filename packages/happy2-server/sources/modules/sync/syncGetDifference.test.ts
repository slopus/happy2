import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chats } from "../schema.js";
import { createDatabase, type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { syncEventInsert } from "./syncEventInsert.js";
import { syncGetDifference } from "./syncGetDifference.js";
import { syncGetState } from "./syncGetState.js";
import { syncInitialize } from "./syncInitialize.js";
import { syncSequenceNext } from "./syncSequenceNext.js";

describe("syncGetDifference product surfaces", () => {
    let client: Client;
    let directory: string;
    let executor: DrizzleExecutor;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-sync-surfaces-"));
        client = createClient({ url: `file:${join(directory, "happy2.db")}` });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        await syncInitialize(executor);
    });

    afterEach(async () => {
        client.close();
        await rm(directory, { force: true, recursive: true });
    });

    it("projects app and contribution events without widening their audience or chat scope", async () => {
        const userId = "surface-viewer";
        await executor.insert(chats).values({
            id: "inaccessible-chat",
            kind: "dm",
            dmKey: "inaccessible-direct-chat",
            dmType: "direct",
            visibility: "direct",
            isListed: 0,
        });
        const baseline = await syncGetState(executor);
        await event(executor, { kind: "plugin.app_instance_invalidated" });
        await event(executor, { kind: "plugin.contribution_changed", chatId: "inaccessible-chat" });
        await event(executor, { kind: "plugin.contribution_deleted" });

        const difference = await syncGetDifference(executor, {
            userId,
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });

        expect(difference).toMatchObject({
            kind: "difference",
            areas: ["apps", "contributions"],
            changedChats: [],
            removedChatIds: [],
        });
        expect(difference.areas).not.toContain("plugins");
        expect(difference.areas).not.toContain("directories");
    });

    it("invalidates apps and contributions when shared UI assets change", async () => {
        const baseline = await syncGetState(executor);
        await event(executor, { kind: "plugin.ui_assets_replaced" });

        const difference = await syncGetDifference(executor, {
            userId: "surface-viewer",
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });

        expect(difference).toMatchObject({
            kind: "difference",
            areas: ["apps", "contributions"],
        });
    });

    it("reconciles the catalog and every cascade-owned surface after uninstall", async () => {
        const baseline = await syncGetState(executor);
        await event(executor, { kind: "plugin.uninstalled" });

        const difference = await syncGetDifference(executor, {
            userId: "surface-viewer",
            generation: baseline.generation,
            fromSequence: Number(baseline.sequence),
            limit: 100,
        });

        expect(difference).toMatchObject({
            kind: "difference",
            areas: ["plugins", "apps", "contributions"],
        });
    });
});

function event(executor: DrizzleExecutor, input: { kind: string; chatId?: string }): Promise<void> {
    return withTransaction(executor, async (tx) => {
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, { sequence, ...input });
    });
}
