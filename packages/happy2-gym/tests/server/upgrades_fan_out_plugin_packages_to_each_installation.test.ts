import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { serverSchemaMigrate } from "happy2-server";
import { describe, expect, it } from "vitest";

describe("server upgrades with shared plugin packages", () => {
    it("copies package metadata, skills, and assets to every installation", async () => {
        const databaseDirectory = await mkdtemp(
            join(tmpdir(), "happy2-gym-plugin-package-upgrade-"),
        );
        const databaseUrl = `file:${join(databaseDirectory, "happy2.db")}`;
        const client = createClient({ url: databaseUrl });

        try {
            await serverSchemaMigrate(client);
            await client.migrate([
                "DROP TABLE document_write_requests",
                "DROP TABLE plugin_skills",
                "DROP TABLE plugin_ui_assets",
                "DROP TABLE plugin_installations",
                `CREATE TABLE plugin_installations (
                    id text PRIMARY KEY NOT NULL,
                    plugin_id text NOT NULL,
                    container_image_id text,
                    runtime_image_tag text,
                    container_name text,
                    container_instance_id text,
                    granted_permissions_json text DEFAULT '[]' NOT NULL,
                    status text DEFAULT 'preparing' NOT NULL,
                    status_detail text,
                    last_error text,
                    installed_by_user_id text,
                    sync_sequence integer DEFAULT 0 NOT NULL,
                    installed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    ready_at text,
                    mcp_tools_synced_at text,
                    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE restrict,
                    FOREIGN KEY (container_image_id) REFERENCES agent_images(id) ON DELETE restrict,
                    FOREIGN KEY (installed_by_user_id) REFERENCES users(id) ON DELETE set null
                )`,
                "CREATE INDEX plugin_installations_plugin_id_index ON plugin_installations (plugin_id)",
                `CREATE TABLE document_write_requests (
                    id text PRIMARY KEY NOT NULL,
                    status text DEFAULT 'pending' NOT NULL,
                    chat_id text NOT NULL,
                    actor_user_id text,
                    agent_user_id text,
                    requester_installation_id text,
                    session_id text NOT NULL,
                    call_id text NOT NULL,
                    document_id text NOT NULL,
                    document_title text NOT NULL,
                    client_update_id text NOT NULL,
                    updates_json text NOT NULL,
                    accepted_sequence text,
                    resolved_by_user_id text,
                    resolved_at text,
                    expires_at text NOT NULL,
                    last_error text,
                    sync_sequence integer DEFAULT 0 NOT NULL,
                    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE cascade,
                    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE set null,
                    FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE set null,
                    FOREIGN KEY (requester_installation_id) REFERENCES plugin_installations(id) ON DELETE set null,
                    FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE set null,
                    CONSTRAINT document_write_requests_status_check
                        CHECK (status in ('pending', 'approved', 'denied', 'failed')),
                    CONSTRAINT document_write_requests_updates_check
                        CHECK (json_valid(updates_json) and json_type(updates_json) = 'array')
                )`,
                "CREATE INDEX document_write_requests_chat_index ON document_write_requests (chat_id, created_at)",
                "CREATE INDEX document_write_requests_pending_expiry_index ON document_write_requests (status, expires_at)",
                "CREATE UNIQUE INDEX document_write_requests_call_unique ON document_write_requests (requester_installation_id, call_id)",
                `CREATE TABLE plugin_skills (
                    plugin_id text NOT NULL,
                    name text NOT NULL,
                    description text NOT NULL,
                    directory text NOT NULL,
                    PRIMARY KEY (plugin_id, name),
                    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE cascade
                )`,
                `CREATE TABLE plugin_ui_assets (
                    plugin_id text NOT NULL,
                    asset_id text NOT NULL,
                    relative_path text NOT NULL,
                    content_type text NOT NULL,
                    byte_size integer NOT NULL,
                    width integer NOT NULL,
                    height integer NOT NULL,
                    checksum_sha256 text NOT NULL,
                    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    PRIMARY KEY (plugin_id, asset_id),
                    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE cascade
                )`,
                "CREATE INDEX plugin_ui_assets_checksum_index ON plugin_ui_assets (checksum_sha256)",
                "ALTER TABLE chats ADD COLUMN parent_message_id TEXT REFERENCES messages(id) ON DELETE RESTRICT",
                "CREATE UNIQUE INDEX chats_parent_message_unique_idx ON chats (parent_message_id) WHERE parent_message_id IS NOT NULL AND deleted_at IS NULL",
                "CREATE INDEX chats_parent_message_idx ON chats (parent_message_id, deleted_at)",
                "ALTER TABLE user_chat_preferences ADD COLUMN notify_thread_replies INTEGER NOT NULL DEFAULT 1 CHECK (notify_thread_replies IN (0, 1))",
                "ALTER TABLE user_chat_preferences ADD COLUMN followed INTEGER NOT NULL DEFAULT 0 CHECK (followed IN (0, 1))",
                "CREATE INDEX user_chat_preferences_followed_idx ON user_chat_preferences (user_id, followed, updated_at DESC)",
                "ALTER TABLE user_notification_preferences ADD COLUMN thread_replies TEXT NOT NULL DEFAULT 'all'",
            ]);

            const manifestJson = JSON.stringify({
                name: "migration-test",
                version: "1.0.0",
            });
            const packageDigest = "a".repeat(64);
            await client.execute({
                sql: `INSERT INTO plugins (
                    id, display_name, short_name, description, source_kind, source_reference,
                    source_version, package_digest, manifest_json, package_directory,
                    image_storage_key, image_content_type, image_size, image_width, image_height,
                    image_thumbhash, image_checksum_sha256
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    "plugin-legacy",
                    "Migration Test",
                    "migration-test",
                    "Legacy package migration fixture",
                    "builtin",
                    "migration-test",
                    "1.0.0",
                    packageDigest,
                    manifestJson,
                    "/tmp/migration-test",
                    "plugin-image",
                    "image/png",
                    1,
                    40,
                    40,
                    "AA==",
                    "b".repeat(64),
                ],
            });
            for (const installationId of ["installation-a", "installation-b"]) {
                await client.execute({
                    sql: `INSERT INTO plugin_installations (id, plugin_id, status)
                          VALUES (?, ?, 'ready')`,
                    args: [installationId, "plugin-legacy"],
                });
            }
            await client.execute({
                sql: `INSERT INTO plugin_skills (plugin_id, name, description, directory)
                      VALUES (?, ?, ?, ?)`,
                args: ["plugin-legacy", "legacy-skill", "Legacy skill", "skills/legacy-skill"],
            });
            await client.execute({
                sql: `INSERT INTO plugin_ui_assets (
                    plugin_id, asset_id, relative_path, content_type, byte_size,
                    width, height, checksum_sha256
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    "plugin-legacy",
                    "plugin-icon",
                    "plugin.png",
                    "image/png",
                    1,
                    40,
                    40,
                    "c".repeat(64),
                ],
            });
            await client.migrate([
                "DROP TABLE plugin_resource_links",
                "ALTER TABLE port_shares DROP COLUMN audience",
                "DROP TRIGGER chats_channel_project_required_insert",
                "DROP TRIGGER chats_channel_project_required_update",
                "DROP TRIGGER chats_dm_project_forbidden_insert",
                "DROP TRIGGER chats_dm_project_forbidden_update",
                "DROP TRIGGER chats_child_project_match_insert",
                "DROP TRIGGER chats_child_project_match_update",
                "DROP TRIGGER chats_parent_project_match_update",
                "DROP INDEX chats_project_id_idx",
                "ALTER TABLE chats DROP COLUMN project_id",
                "DROP INDEX projects_sync_sequence_idx",
                "DROP INDEX projects_one_default_idx",
                "DROP TABLE projects",
            ]);
            await client.execute({
                sql: "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
                args: [1785369600000],
            });

            await serverSchemaMigrate(client);

            const installations = await client.execute(
                `SELECT id, source_version, package_digest, manifest_json, package_directory
                 FROM plugin_installations ORDER BY id`,
            );
            expect(installations.rows).toEqual([
                expect.objectContaining({
                    id: "installation-a",
                    source_version: "1.0.0",
                    package_digest: packageDigest,
                    manifest_json: manifestJson,
                    package_directory: "/tmp/migration-test",
                }),
                expect.objectContaining({
                    id: "installation-b",
                    source_version: "1.0.0",
                    package_digest: packageDigest,
                    manifest_json: manifestJson,
                    package_directory: "/tmp/migration-test",
                }),
            ]);

            const skills = await client.execute(
                "SELECT installation_id, name FROM plugin_skills ORDER BY installation_id",
            );
            expect(skills.rows).toEqual([
                expect.objectContaining({
                    installation_id: "installation-a",
                    name: "legacy-skill",
                }),
                expect.objectContaining({
                    installation_id: "installation-b",
                    name: "legacy-skill",
                }),
            ]);
            const assets = await client.execute(
                "SELECT installation_id, asset_id FROM plugin_ui_assets ORDER BY installation_id",
            );
            expect(assets.rows).toEqual([
                expect.objectContaining({
                    installation_id: "installation-a",
                    asset_id: "plugin-icon",
                }),
                expect.objectContaining({
                    installation_id: "installation-b",
                    asset_id: "plugin-icon",
                }),
            ]);

            const columns = await client.execute("PRAGMA table_info(plugin_installations)");
            const requiredPackageColumns = new Map(
                columns.rows
                    .filter(({ name }) =>
                        [
                            "source_version",
                            "package_digest",
                            "manifest_json",
                            "package_directory",
                        ].includes(String(name)),
                    )
                    .map(({ name, notnull }) => [String(name), Number(notnull)]),
            );
            expect(requiredPackageColumns).toEqual(
                new Map([
                    ["source_version", 1],
                    ["package_digest", 1],
                    ["manifest_json", 1],
                    ["package_directory", 1],
                ]),
            );
            const documentWriteRequestColumns = await client.execute(
                "PRAGMA table_info(document_write_requests)",
            );
            const baseSequence = documentWriteRequestColumns.rows.find(
                ({ name }) => name === "base_sequence",
            );
            expect(baseSequence).toEqual(
                expect.objectContaining({
                    name: "base_sequence",
                    notnull: 1,
                    dflt_value: "'0'",
                }),
            );
            expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
        } finally {
            client.close();
            await rm(databaseDirectory, { recursive: true, force: true });
        }
    });
});
