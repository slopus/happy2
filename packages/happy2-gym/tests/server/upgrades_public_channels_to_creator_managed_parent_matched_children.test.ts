import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { serverSchemaMigrate } from "happy2-server";
import { describe, expect, it } from "vitest";

describe("server upgrades for public ownership and child visibility", () => {
    it("removes public owners and matches an existing child's visibility to its parent", async () => {
        const databaseDirectory = await mkdtemp(join(tmpdir(), "happy2-gym-channel-upgrade-"));
        const client = createClient({ url: `file:${join(databaseDirectory, "happy2.db")}` });

        try {
            await serverSchemaMigrate(client);
            await client.migrate([
                "INSERT INTO accounts (id, email, active) VALUES ('legacy-account', 'legacy@example.com', 1)",
                "INSERT INTO accounts (id, email, active) VALUES ('legacy-owner-account', 'legacy-owner@example.com', 1)",
                "INSERT INTO users (id, account_id, first_name, username) VALUES ('legacy-user', 'legacy-account', 'Legacy', 'legacy-user')",
                "INSERT INTO users (id, account_id, first_name, username) VALUES ('legacy-owner', 'legacy-owner-account', 'Owner', 'legacy-owner')",
                "INSERT INTO projects (id, name, is_default) VALUES ('legacy-project', 'Legacy', 1)",
                "INSERT INTO chats (id, kind, project_id, name, created_by_user_id, owner_user_id, visibility) VALUES ('legacy-parent', 'public_channel', 'legacy-project', 'Legacy parent', 'legacy-user', 'legacy-user', 'public')",
                "INSERT INTO chats (id, kind, project_id, name, parent_chat_id, created_by_user_id, owner_user_id, visibility) VALUES ('legacy-child', 'private_channel', 'legacy-project', 'Legacy child', 'legacy-parent', 'legacy-user', 'legacy-user', 'private')",
                "INSERT INTO chats (id, kind, project_id, name, created_by_user_id, owner_user_id, visibility) VALUES ('legacy-private-parent', 'private_channel', 'legacy-project', 'Private parent', 'legacy-owner', 'legacy-owner', 'private')",
                "INSERT INTO chats (id, kind, project_id, name, parent_chat_id, created_by_user_id, owner_user_id, visibility) VALUES ('legacy-private-child', 'private_channel', 'legacy-project', 'Private child', 'legacy-private-parent', 'legacy-user', 'legacy-user', 'private')",
                "INSERT INTO chat_members (chat_id, user_id, role, membership_epoch) VALUES ('legacy-parent', 'legacy-user', 'owner', 'legacy-parent-member')",
                "INSERT INTO chat_members (chat_id, user_id, role, membership_epoch) VALUES ('legacy-child', 'legacy-user', 'owner', 'legacy-child-member')",
                "INSERT INTO chat_members (chat_id, user_id, role, membership_epoch) VALUES ('legacy-private-parent', 'legacy-owner', 'owner', 'legacy-private-parent-owner')",
                "INSERT INTO chat_members (chat_id, user_id, role, membership_epoch) VALUES ('legacy-private-child', 'legacy-user', 'owner', 'legacy-private-child-owner')",
            ]);
            await client.execute({
                sql: "DELETE FROM __drizzle_migrations WHERE created_at = ?",
                args: [1785974400000],
            });

            await serverSchemaMigrate(client);

            expect(
                (
                    await client.execute(
                        "SELECT id, kind, visibility, owner_user_id FROM chats WHERE id IN ('legacy-parent', 'legacy-child') ORDER BY id",
                    )
                ).rows,
            ).toEqual([
                expect.objectContaining({
                    id: "legacy-child",
                    kind: "public_channel",
                    visibility: "public",
                    owner_user_id: null,
                }),
                expect.objectContaining({
                    id: "legacy-parent",
                    kind: "public_channel",
                    visibility: "public",
                    owner_user_id: null,
                }),
            ]);
            expect(
                (
                    await client.execute(
                        "SELECT kind, visibility, owner_user_id FROM chats WHERE id = 'legacy-private-child'",
                    )
                ).rows,
            ).toEqual([
                expect.objectContaining({
                    kind: "private_channel",
                    visibility: "private",
                    owner_user_id: "legacy-owner",
                }),
            ]);
            expect(
                (
                    await client.execute(
                        "SELECT user_id, role FROM chat_members WHERE chat_id = 'legacy-private-child' AND left_at IS NULL ORDER BY user_id",
                    )
                ).rows,
            ).toEqual([expect.objectContaining({ user_id: "legacy-owner", role: "owner" })]);
            expect(
                (
                    await client.execute(
                        "SELECT left_at, removed_by_user_id FROM chat_members WHERE chat_id = 'legacy-private-child' AND user_id = 'legacy-user'",
                    )
                ).rows,
            ).toEqual([
                expect.objectContaining({
                    left_at: expect.any(String),
                    removed_by_user_id: null,
                }),
            ]);
            expect(
                (
                    await client.execute(
                        "SELECT chat_id, role FROM chat_members WHERE user_id = 'legacy-user' AND chat_id IN ('legacy-parent', 'legacy-child') ORDER BY chat_id",
                    )
                ).rows,
            ).toEqual([
                expect.objectContaining({ chat_id: "legacy-child", role: "admin" }),
                expect.objectContaining({ chat_id: "legacy-parent", role: "admin" }),
            ]);
        } finally {
            client.close();
            await rm(databaseDirectory, { recursive: true, force: true });
        }
    });
});
