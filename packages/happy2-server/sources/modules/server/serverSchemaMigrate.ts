import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase } from "../drizzle.js";
import { serverSyncState } from "../schema.js";

/**
 * Runs durable schema migrations and ensures the singleton serverSyncState cursor exists without creating product identities before setup.
 * The default agent and its channel substrate are initialized later, after a ready agent image has been configured.
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
}
