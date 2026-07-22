import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase, type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { chats, projects, serverSyncState } from "../schema.js";

const TEMPORARY_DEFAULT_PROJECT_ID = "happy2_temporary_default_project";

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
    await normalizeTemporaryProjectId(executor);
    await finalizeProjectIntegrityTriggers(client);
    await executor
        .insert(serverSyncState)
        .values({ id: 1, generation: createId(), sequence: 0 })
        .onConflictDoNothing();
}

async function finalizeProjectIntegrityTriggers(client: Client): Promise<void> {
    await client.migrate([
        "DROP TRIGGER IF EXISTS chats_child_project_match_update",
        "DROP TRIGGER IF EXISTS chats_parent_project_match_update",
        `CREATE TRIGGER chats_child_project_match_update
         BEFORE UPDATE OF parent_chat_id, project_id ON chats
         WHEN NEW.parent_chat_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM chats AS parent
               WHERE parent.id = NEW.parent_chat_id
                 AND parent.project_id IS NEW.project_id
           )
         BEGIN
             SELECT RAISE(ABORT, 'child channels must share their parent project');
         END`,
        `CREATE TRIGGER chats_parent_project_match_update
         BEFORE UPDATE OF project_id ON chats
         WHEN EXISTS (
             SELECT 1 FROM chats AS child
             WHERE child.parent_chat_id = OLD.id
               AND child.project_id IS NOT NEW.project_id
         )
         BEGIN
             SELECT RAISE(ABORT, 'parent channels must share their child projects');
         END`,
    ]);
}

async function normalizeTemporaryProjectId(executor: DrizzleExecutor): Promise<void> {
    await withTransaction(executor, async (tx) => {
        const [temporary] = await tx
            .select({
                name: projects.name,
                description: projects.description,
                isDefault: projects.isDefault,
                createdByUserId: projects.createdByUserId,
                syncSequence: projects.syncSequence,
                createdAt: projects.createdAt,
                updatedAt: projects.updatedAt,
            })
            .from(projects)
            .where(eq(projects.id, TEMPORARY_DEFAULT_PROJECT_ID))
            .limit(1);
        if (!temporary) return;
        const projectId = createId();
        await tx
            .update(projects)
            .set({ isDefault: 0 })
            .where(eq(projects.id, TEMPORARY_DEFAULT_PROJECT_ID));
        await tx.insert(projects).values({ id: projectId, ...temporary });
        await tx
            .update(chats)
            .set({ projectId })
            .where(eq(chats.projectId, TEMPORARY_DEFAULT_PROJECT_ID));
        await tx.delete(projects).where(eq(projects.id, TEMPORARY_DEFAULT_PROJECT_ID));
    });
}
