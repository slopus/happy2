import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { serverSchemaMigrate } from "happy2-server";
import { describe, expect, it } from "vitest";

const PROJECTS_MIGRATION_TIMESTAMP = 1_785_801_600_000;
const TEMPORARY_DEFAULT_PROJECT_ID = "happy2_temporary_default_project";

describe("server upgrades with legacy channels", () => {
    it("attaches every legacy channel to one generated default project while leaving direct messages unscoped", async () => {
        const databaseDirectory = await mkdtemp(join(tmpdir(), "happy2-gym-project-upgrade-"));
        const client = createClient({ url: `file:${join(databaseDirectory, "happy2.db")}` });

        try {
            await serverSchemaMigrate(client);
            await client.migrate([
                "DROP TRIGGER chats_channel_project_required_insert",
                "DROP TRIGGER chats_channel_project_required_update",
                "DROP TRIGGER chats_dm_project_forbidden_insert",
                "DROP TRIGGER chats_dm_project_forbidden_update",
                "DROP TRIGGER chats_child_project_match_insert",
                "DROP TRIGGER chats_child_project_match_update",
                "DROP TRIGGER chats_parent_project_match_update",
                "DROP INDEX chats_project_id_idx",
                "ALTER TABLE chats DROP COLUMN project_id",
                "DROP INDEX projects_one_default_idx",
                "DROP INDEX projects_sync_sequence_idx",
                "DROP TABLE projects",
            ]);
            await client.execute({
                sql: "DELETE FROM __drizzle_migrations WHERE created_at = ?",
                args: [PROJECTS_MIGRATION_TIMESTAMP],
            });

            await client.migrate([
                "INSERT INTO chats (id, kind, name, dm_key) VALUES ('legacy-dm', 'dm', 'Legacy direct message', 'legacy-dm-key')",
                "INSERT INTO chats (id, kind, name, slug) VALUES ('legacy-public', 'public_channel', 'Legacy public', 'legacy-public')",
                "INSERT INTO chats (id, kind, name, slug) VALUES ('legacy-private', 'private_channel', 'Legacy private', 'legacy-private')",
                "INSERT INTO chats (id, kind, name, slug, parent_chat_id) VALUES ('legacy-child', 'private_channel', 'Legacy child', 'legacy-child', 'legacy-private')",
                "INSERT INTO chats (id, kind, name, slug, archived_at) VALUES ('legacy-archived', 'public_channel', 'Legacy archived', 'legacy-archived', CURRENT_TIMESTAMP)",
                "INSERT INTO chats (id, kind, name, slug, deleted_at) VALUES ('legacy-deleted', 'private_channel', 'Legacy deleted', 'legacy-deleted', CURRENT_TIMESTAMP)",
            ]);

            await serverSchemaMigrate(client);

            const defaultProjectId = await expectOneGeneratedDefaultProject(client);
            const firstAssignments = await chatProjectAssignments(client);
            expect(firstAssignments).toEqual([
                { id: "legacy-archived", kind: "public_channel", project_id: defaultProjectId },
                { id: "legacy-child", kind: "private_channel", project_id: defaultProjectId },
                { id: "legacy-deleted", kind: "private_channel", project_id: defaultProjectId },
                { id: "legacy-dm", kind: "dm", project_id: null },
                { id: "legacy-private", kind: "private_channel", project_id: defaultProjectId },
                { id: "legacy-public", kind: "public_channel", project_id: defaultProjectId },
            ]);
            expect(firstAssignments.find(({ id }) => id === "legacy-child")?.project_id).toBe(
                firstAssignments.find(({ id }) => id === "legacy-private")?.project_id,
            );
            expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);

            await client.execute(
                "INSERT INTO projects (id, name) VALUES ('integrity-project', 'Integrity project')",
            );
            await expect(
                client.execute(
                    "UPDATE chats SET project_id = 'integrity-project' WHERE id = 'legacy-child'",
                ),
            ).rejects.toThrow(/child channels must share their parent project/);
            await expect(
                client.execute(
                    "UPDATE chats SET project_id = 'integrity-project' WHERE id = 'legacy-private'",
                ),
            ).rejects.toThrow(/parent channels must share their child projects/);
            const updateTriggerDefinitions = await client.execute(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('chats_child_project_match_update', 'chats_parent_project_match_update') ORDER BY name",
            );
            expect(updateTriggerDefinitions.rows).toHaveLength(2);
            expect(updateTriggerDefinitions.rows.map((row) => String(row.sql))).not.toEqual(
                expect.arrayContaining([expect.stringContaining(TEMPORARY_DEFAULT_PROJECT_ID)]),
            );
            await client.execute("DELETE FROM projects WHERE id = 'integrity-project'");

            await serverSchemaMigrate(client);

            expect(await expectOneGeneratedDefaultProject(client)).toBe(defaultProjectId);
            expect(await chatProjectAssignments(client)).toEqual(firstAssignments);
            expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
        } finally {
            client.close();
            await rm(databaseDirectory, { recursive: true, force: true });
        }
    });
});

async function expectOneGeneratedDefaultProject(
    client: ReturnType<typeof createClient>,
): Promise<string> {
    const result = await client.execute(
        "SELECT id, is_default FROM projects ORDER BY created_at, id",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ is_default: 1 });
    const projectId = String(result.rows[0]!.id);
    expect(projectId).not.toBe(TEMPORARY_DEFAULT_PROJECT_ID);
    expect(projectId).toMatch(/^[a-z][a-z0-9]{23}$/);
    return projectId;
}

async function chatProjectAssignments(
    client: ReturnType<typeof createClient>,
): Promise<Array<{ id: string; kind: string; project_id: string | null }>> {
    const result = await client.execute("SELECT id, kind, project_id FROM chats ORDER BY id");
    return result.rows.map((row) => ({
        id: String(row.id),
        kind: String(row.kind),
        project_id: row.project_id === null ? null : String(row.project_id),
    }));
}
