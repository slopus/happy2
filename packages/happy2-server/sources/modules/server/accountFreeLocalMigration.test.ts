import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

describe("account-free local users migration", () => {
    it("preserves populated account-backed users, search indexing, and foreign keys", async () => {
        const client = createClient({ url: ":memory:" });
        try {
            const migrations = readMigrationFiles({ migrationsFolder });
            const migrationIndex = migrations.findIndex((migration) =>
                migration.sql.join("\n").includes("users_account_free_local"),
            );
            const journal = JSON.parse(
                await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"),
            ) as { entries: Array<{ idx: number; tag: string }> };
            expect(migrationIndex).toBe(49);
            expect(journal.entries[49]).toMatchObject({
                idx: 49,
                tag: "0049_account_free_local_users",
            });
            for (const migration of migrations.slice(0, migrationIndex))
                await client.migrate(migration.sql.filter((statement) => statement.trim()));

            await client.execute({
                sql: "INSERT INTO accounts (id, email, active) VALUES (?, ?, 1)",
                args: ["account-before-local-migration", "existing@example.test"],
            });
            await client.execute({
                sql: "INSERT INTO users (id, account_id, first_name, username, role) VALUES (?, ?, ?, ?, ?)",
                args: [
                    "user-before-local-migration",
                    "account-before-local-migration",
                    "Existing",
                    "existing_user",
                    "admin",
                ],
            });
            await client.execute({
                sql: "INSERT INTO accounts (id, email, active, banned_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)",
                args: ["banned-account-before-local-migration", "banned@example.test"],
            });
            await client.execute({
                sql: "INSERT INTO users (id, account_id, first_name, username, role) VALUES (?, ?, ?, ?, ?)",
                args: [
                    "banned-user-before-local-migration",
                    "banned-account-before-local-migration",
                    "Banned",
                    "banned_user",
                    "member",
                ],
            });
            await client.execute({
                sql: "INSERT INTO accounts (id, email, active) VALUES (?, ?, 1)",
                args: ["member-account-before-local-migration", "member@example.test"],
            });
            await client.execute({
                sql: "INSERT INTO users (id, account_id, first_name, username, role) VALUES (?, ?, ?, ?, ?)",
                args: [
                    "member-user-before-local-migration",
                    "member-account-before-local-migration",
                    "Member",
                    "member_user",
                    "member",
                ],
            });
            await client.execute({
                sql: `INSERT INTO agent_images
                    (id, name, dockerfile, definition_hash, docker_tag, status, build_progress, docker_image_id, ready_at)
                    VALUES (?, 'Migration agent', 'FROM scratch', ?, ?, 'ready', 100, ?, CURRENT_TIMESTAMP)`,
                args: [
                    "agent-image-before-local-migration",
                    "agent-image-before-local-migration-hash",
                    "happy2:migration-agent",
                    "sha256:migration-agent",
                ],
            });
            await client.execute({
                sql: `INSERT INTO users
                    (id, account_id, kind, agent_image_id, first_name, username, role)
                    VALUES (?, NULL, 'agent', ?, 'Migration Agent', ?, 'member')`,
                args: [
                    "agent-before-local-migration",
                    "agent-image-before-local-migration",
                    "migration_agent",
                ],
            });
            const projectId = "project-before-local-migration";
            await client.execute({
                sql: `INSERT INTO projects (id, name, is_default, created_by_user_id)
                    VALUES (?, 'Migration project', 1, ?)`,
                args: [projectId, "user-before-local-migration"],
            });
            await insertLegacyChannel(client, {
                id: "agent-owned-before-local-migration",
                ownerUserId: "agent-before-local-migration",
                projectId,
                members: [
                    ["agent-before-local-migration", "owner", "2024-01-01T00:00:00.000Z"],
                    ["banned-user-before-local-migration", "owner", "2024-01-02T00:00:00.000Z"],
                    ["user-before-local-migration", "admin", "2024-01-03T00:00:00.000Z"],
                    ["member-user-before-local-migration", "member", "2024-01-04T00:00:00.000Z"],
                ],
            });
            await insertLegacyChannel(client, {
                id: "ownerless-before-local-migration",
                ownerUserId: null,
                projectId,
                members: [
                    ["agent-before-local-migration", "owner", "2024-01-01T00:00:00.000Z"],
                    ["banned-user-before-local-migration", "owner", "2024-01-02T00:00:00.000Z"],
                ],
            });
            await insertLegacyChannel(client, {
                id: "mismatched-before-local-migration",
                ownerUserId: "member-user-before-local-migration",
                projectId,
                members: [
                    ["user-before-local-migration", "owner", "2024-01-01T00:00:00.000Z"],
                    ["member-user-before-local-migration", "member", "2024-01-02T00:00:00.000Z"],
                ],
            });
            await insertLegacyChannel(client, {
                id: "dm-before-local-migration",
                kind: "dm",
                ownerUserId: "agent-before-local-migration",
                projectId,
                members: [
                    ["agent-before-local-migration", "owner", "2024-01-01T00:00:00.000Z"],
                    ["user-before-local-migration", "member", "2024-01-02T00:00:00.000Z"],
                ],
            });
            await insertLegacyChannel(client, {
                id: "public-before-local-migration",
                kind: "public_channel",
                ownerUserId: "agent-before-local-migration",
                projectId,
                members: [
                    ["agent-before-local-migration", "owner", "2024-01-01T00:00:00.000Z"],
                    ["user-before-local-migration", "owner", "2024-01-02T00:00:00.000Z"],
                    ["member-user-before-local-migration", "member", "2024-01-03T00:00:00.000Z"],
                ],
            });
            await client.execute({
                sql: "UPDATE server_setup_state SET bootstrap_account_id = ?, bootstrap_admin_user_id = ? WHERE id = 1",
                args: ["account-before-local-migration", "user-before-local-migration"],
            });

            const migration = migrations[migrationIndex]!;
            await client.migrate(migration.sql.filter((statement) => statement.trim()));

            expect(
                (
                    await client.execute(
                        "SELECT account_id, active, username, role FROM users WHERE id = 'user-before-local-migration'",
                    )
                ).rows[0],
            ).toMatchObject({
                account_id: "account-before-local-migration",
                active: 1,
                username: "existing_user",
                role: "admin",
            });
            expect(
                (
                    await client.execute(
                        "SELECT active FROM users WHERE id = 'banned-user-before-local-migration'",
                    )
                ).rows[0],
            ).toMatchObject({ active: 0 });
            expect(
                (
                    await client.execute(
                        "SELECT owner_user_id FROM chats WHERE id = 'agent-owned-before-local-migration'",
                    )
                ).rows[0],
            ).toMatchObject({ owner_user_id: "user-before-local-migration" });
            expect(
                (
                    await client.execute(
                        `SELECT user_id, role FROM chat_members
                         WHERE chat_id = 'agent-owned-before-local-migration'
                         ORDER BY user_id`,
                    )
                ).rows,
            ).toEqual([
                { user_id: "agent-before-local-migration", role: "member" },
                { user_id: "banned-user-before-local-migration", role: "member" },
                { user_id: "member-user-before-local-migration", role: "member" },
                { user_id: "user-before-local-migration", role: "owner" },
            ]);
            expect(
                (
                    await client.execute(
                        "SELECT owner_user_id FROM chats WHERE id = 'ownerless-before-local-migration'",
                    )
                ).rows[0],
            ).toMatchObject({ owner_user_id: null });
            expect(
                (
                    await client.execute(
                        `SELECT role FROM chat_members
                         WHERE chat_id = 'ownerless-before-local-migration'
                         ORDER BY user_id`,
                    )
                ).rows,
            ).toEqual([{ role: "member" }, { role: "member" }]);
            expect(
                (
                    await client.execute(
                        `SELECT chats.owner_user_id, chat_members.role
                         FROM chats
                         JOIN chat_members
                           ON chat_members.chat_id = chats.id
                          AND chat_members.user_id = chats.owner_user_id
                         WHERE chats.id = 'mismatched-before-local-migration'`,
                    )
                ).rows[0],
            ).toMatchObject({
                owner_user_id: "member-user-before-local-migration",
                role: "owner",
            });
            expect(
                (
                    await client.execute(
                        `SELECT user_id, role FROM chat_members
                         WHERE chat_id = 'mismatched-before-local-migration'
                         ORDER BY user_id`,
                    )
                ).rows,
            ).toEqual([
                { user_id: "member-user-before-local-migration", role: "owner" },
                { user_id: "user-before-local-migration", role: "admin" },
            ]);
            expect(
                (
                    await client.execute(
                        "SELECT owner_user_id FROM chats WHERE id = 'public-before-local-migration'",
                    )
                ).rows[0],
            ).toMatchObject({ owner_user_id: null });
            expect(
                (
                    await client.execute(
                        `SELECT user_id, role FROM chat_members
                         WHERE chat_id = 'public-before-local-migration'
                         ORDER BY user_id`,
                    )
                ).rows,
            ).toEqual([
                { user_id: "agent-before-local-migration", role: "admin" },
                { user_id: "member-user-before-local-migration", role: "member" },
                { user_id: "user-before-local-migration", role: "admin" },
            ]);
            expect(
                (
                    await client.execute(
                        `SELECT chats.owner_user_id, chat_members.role
                         FROM chats
                         JOIN chat_members
                           ON chat_members.chat_id = chats.id
                          AND chat_members.user_id = chats.owner_user_id
                         WHERE chats.id = 'dm-before-local-migration'`,
                    )
                ).rows[0],
            ).toMatchObject({
                owner_user_id: "agent-before-local-migration",
                role: "owner",
            });
            expect(
                (
                    await client.execute({
                        sql: `SELECT id, project_id FROM chats
                            WHERE id IN (?, ?, ?, ?) ORDER BY id`,
                        args: [
                            "agent-owned-before-local-migration",
                            "mismatched-before-local-migration",
                            "ownerless-before-local-migration",
                            "public-before-local-migration",
                        ],
                    })
                ).rows,
            ).toEqual(
                [
                    "agent-owned-before-local-migration",
                    "mismatched-before-local-migration",
                    "ownerless-before-local-migration",
                    "public-before-local-migration",
                ].map((id) => ({ id, project_id: projectId })),
            );
            expect(
                (
                    await client.execute({
                        sql: "SELECT created_by_user_id FROM projects WHERE id = ?",
                        args: [projectId],
                    })
                ).rows[0],
            ).toMatchObject({ created_by_user_id: "user-before-local-migration" });
            expect(
                Number(
                    (
                        await client.execute(
                            "SELECT count(*) AS count FROM users_fts WHERE users_fts MATCH 'existing_user'",
                        )
                    ).rows[0]?.count,
                ),
            ).toBe(1);
            await client.execute(
                "UPDATE accounts SET active = 0, banned_at = CURRENT_TIMESTAMP WHERE id = 'account-before-local-migration'",
            );
            expect(await searchCount(client, "existing_user")).toBe(1);
            await client.execute(
                "UPDATE users SET active = 0 WHERE id = 'user-before-local-migration'",
            );
            expect(await searchCount(client, "existing_user")).toBe(0);
            await client.execute(
                "UPDATE users SET active = 1 WHERE id = 'user-before-local-migration'",
            );
            expect(await searchCount(client, "existing_user")).toBe(1);

            await client.execute(
                "INSERT INTO users (id, first_name, username, role) VALUES ('local-after-migration', 'Local', 'local_after_migration', 'admin')",
            );
            expect(await searchCount(client, "local_after_migration")).toBe(1);
            await client.execute(
                "UPDATE server_setup_state SET bootstrap_account_id = NULL, bootstrap_admin_user_id = 'local-after-migration', registration_enabled = 0 WHERE id = 1",
            );
            await expect(
                client.execute(
                    "UPDATE server_setup_state SET registration_enabled = 1 WHERE id = 1",
                ),
            ).rejects.toThrow("CHECK constraint failed");
            await expect(
                client.execute(
                    "INSERT INTO chats (id, kind, name, slug, visibility) VALUES ('missing-project-after-local-migration', 'private_channel', 'Missing project', 'missing-project', 'private')",
                ),
            ).rejects.toThrow("channels require a project");
            expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
        } finally {
            client.close();
        }
    });
});

async function insertLegacyChannel(
    client: ReturnType<typeof createClient>,
    input: {
        id: string;
        kind?: "dm" | "private_channel" | "public_channel";
        members: Array<[userId: string, role: string, joinedAt: string]>;
        ownerUserId: string | null;
        projectId: string;
    },
): Promise<void> {
    const kind = input.kind ?? "private_channel";
    await client.execute({
        sql: `INSERT INTO chats
            (id, kind, project_id, name, slug, dm_key, owner_user_id, visibility, is_listed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            input.id,
            kind,
            kind === "dm" ? null : input.projectId,
            kind === "dm" ? null : input.id,
            kind === "dm" ? null : input.id,
            kind === "dm" ? input.id : null,
            input.ownerUserId,
            kind === "dm" ? "direct" : kind === "public_channel" ? "public" : "private",
            kind === "dm" ? 0 : 1,
        ],
    });
    for (const [userId, role, joinedAt] of input.members)
        await client.execute({
            sql: `INSERT INTO chat_members
                (chat_id, user_id, role, membership_epoch, joined_at)
                VALUES (?, ?, ?, ?, ?)`,
            args: [input.id, userId, role, `${input.id}:${userId}`, joinedAt],
        });
}

async function searchCount(
    client: ReturnType<typeof createClient>,
    query: string,
): Promise<number> {
    const result = await client.execute({
        sql: "SELECT count(*) AS count FROM users_fts WHERE users_fts MATCH ?",
        args: [query],
    });
    return Number(result.rows[0]?.count);
}
