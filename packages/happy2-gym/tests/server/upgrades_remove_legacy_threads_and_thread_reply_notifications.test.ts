import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { serverSchemaMigrate } from "happy2-server";
import { describe, expect, it } from "vitest";

describe("server upgrades after thread removal", () => {
    it("soft-deletes legacy thread chats and removes thread notification state", async () => {
        const databaseDirectory = await mkdtemp(join(tmpdir(), "happy2-gym-thread-upgrade-"));
        const client = createClient({ url: `file:${join(databaseDirectory, "happy2.db")}` });

        try {
            await serverSchemaMigrate(client);
            await client.migrate([
                "ALTER TABLE chats ADD COLUMN parent_message_id TEXT REFERENCES messages(id) ON DELETE RESTRICT",
                "CREATE UNIQUE INDEX chats_parent_message_unique_idx ON chats (parent_message_id) WHERE parent_message_id IS NOT NULL AND deleted_at IS NULL",
                "CREATE INDEX chats_parent_message_idx ON chats (parent_message_id, deleted_at)",
                "ALTER TABLE user_chat_preferences ADD COLUMN notify_thread_replies INTEGER NOT NULL DEFAULT 1 CHECK (notify_thread_replies IN (0, 1))",
                "ALTER TABLE user_chat_preferences ADD COLUMN followed INTEGER NOT NULL DEFAULT 0 CHECK (followed IN (0, 1))",
                "CREATE INDEX user_chat_preferences_followed_idx ON user_chat_preferences (user_id, followed, updated_at DESC)",
                "ALTER TABLE user_notification_preferences ADD COLUMN thread_replies TEXT NOT NULL DEFAULT 'all'",
                "INSERT INTO accounts (id, email, active) VALUES ('legacy-account', 'legacy@example.com', 1)",
                "INSERT INTO users (id, account_id, first_name, username) VALUES ('legacy-user', 'legacy-account', 'Legacy', 'legacy-user')",
                "INSERT INTO chats (id, kind, name, created_by_user_id) VALUES ('root-chat', 'private_channel', 'Root channel', 'legacy-user')",
                "INSERT INTO messages (id, chat_id, sequence, change_pts, sender_user_id, text) VALUES ('root-message', 'root-chat', 1, 1, 'legacy-user', 'Legacy root')",
                "INSERT INTO chats (id, kind, name, created_by_user_id, parent_message_id) VALUES ('legacy-thread', 'private_channel', 'Legacy thread', 'legacy-user', 'root-message')",
                "INSERT INTO notifications (id, user_id, kind, chat_id, message_id) VALUES ('legacy-thread-notification', 'legacy-user', 'thread_reply', 'legacy-thread', 'root-message')",
            ]);
            await client.execute({
                sql: "DELETE FROM __drizzle_migrations WHERE created_at = ?",
                args: [1785628800000],
            });

            await serverSchemaMigrate(client);

            expect(
                (
                    await client.execute(
                        "SELECT deleted_at, delete_reason FROM chats WHERE id = 'legacy-thread'",
                    )
                ).rows[0],
            ).toMatchObject({
                deleted_at: expect.any(String),
                delete_reason: "Threads were replaced by child channels",
            });
            expect(
                (
                    await client.execute(
                        "SELECT id FROM notifications WHERE id = 'legacy-thread-notification'",
                    )
                ).rows,
            ).toEqual([]);

            for (const [table, removedColumns] of [
                ["chats", ["parent_message_id"]],
                ["user_chat_preferences", ["notify_thread_replies", "followed"]],
                ["user_notification_preferences", ["thread_replies"]],
            ] as const) {
                const columns = await client.execute(`PRAGMA table_info(${table})`);
                const columnNames = columns.rows.map(({ name }) => String(name));
                for (const removedColumn of removedColumns) {
                    expect(columnNames).not.toContain(removedColumn);
                }
            }
            expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
        } finally {
            client.close();
            await rm(databaseDirectory, { recursive: true, force: true });
        }
    });
});
