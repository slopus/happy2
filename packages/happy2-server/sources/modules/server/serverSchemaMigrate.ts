import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase, withTransaction } from "../drizzle.js";
import { serverSyncState } from "../schema.js";
import { ensureChannelDefaults } from "./impl/ensureChannelDefaults.js";

/**
 * Runs durable schema migrations, ensures the singleton serverSyncState cursor exists, then transactionally reconciles required channel defaults.
 * DDL and cursor initialization intentionally precede the idempotent defaults transaction so a later startup can resume safely after interruption.
 */
export async function serverSchemaMigrate(client: Client): Promise<void> {
    const executor = createDatabase(client);
    // WAL lets realtime readers continue while request/background actions commit locally.
    if (client.protocol === "file") await client.execute("PRAGMA journal_mode = WAL");
    await migrate(executor, {
        migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle"),
    });
    await executor
        .insert(serverSyncState)
        .values({ id: 1, generation: createId(), sequence: 0 })
        .onConflictDoNothing();
    await withTransaction(executor, ensureChannelDefaults);
}
