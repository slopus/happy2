import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { serverSchemaMigrate } from "happy2-server";
import { describe, expect, it } from "vitest";

describe("server upgrades with automated message attribution", () => {
    it("preserves existing messages and marks them as not automated", async () => {
        const databaseDirectory = await mkdtemp(join(tmpdir(), "happy2-gym-message-upgrade-"));
        const client = createClient({ url: `file:${join(databaseDirectory, "happy2.db")}` });

        try {
            await serverSchemaMigrate(client);
            await client.migrate([
                "ALTER TABLE messages DROP COLUMN automated",
                "INSERT INTO accounts (id, email, active) VALUES ('legacy-account', 'legacy@example.com', 1)",
                "INSERT INTO users (id, account_id, first_name, username) VALUES ('legacy-user', 'legacy-account', 'Legacy', 'legacy-user')",
                "INSERT INTO projects (id, name, is_default) VALUES ('legacy-project', 'Legacy', 1)",
                "INSERT INTO chats (id, kind, project_id, name, created_by_user_id) VALUES ('legacy-chat', 'private_channel', 'legacy-project', 'Legacy channel', 'legacy-user')",
                "INSERT INTO messages (id, chat_id, sequence, change_pts, sender_user_id, text) VALUES ('legacy-message', 'legacy-chat', 1, 1, 'legacy-user', 'Existing user message')",
            ]);
            await client.execute({
                sql: "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
                args: [1785888000000],
            });

            await serverSchemaMigrate(client);

            expect(
                (
                    await client.execute(
                        "SELECT automated, text FROM messages WHERE id = 'legacy-message'",
                    )
                ).rows[0],
            ).toMatchObject({
                automated: 0,
                text: "Existing user message",
            });
            const automatedColumn = (await client.execute("PRAGMA table_info(messages)")).rows.find(
                ({ name }) => name === "automated",
            );
            expect(automatedColumn).toMatchObject({ notnull: 1, dflt_value: "0" });
        } finally {
            client.close();
            await rm(databaseDirectory, { recursive: true, force: true });
        }
    });
});
