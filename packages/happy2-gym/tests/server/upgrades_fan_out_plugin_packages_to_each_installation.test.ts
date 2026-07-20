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
            await client.execute({
                sql: "DELETE FROM __drizzle_migrations WHERE created_at = ?",
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
            expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
        } finally {
            client.close();
            await rm(databaseDirectory, { recursive: true, force: true });
        }
    });
});
