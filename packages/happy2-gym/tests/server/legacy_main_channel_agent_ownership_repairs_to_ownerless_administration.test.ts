import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon } from "happy2-gym/rig";
import { createGymServer } from "../../sources/index.js";

describe("legacy main channel ownerless administration repair", () => {
    it("clears public ownership and converts legacy owners to administrators on restart", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await createGymServer({
            databaseMode: "file",
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const setupOwner = await server.createUser({ username: "legacy_setup_owner" });
        const preferredMember = await server.createUser({ username: "legacy_channel_member" });
        const inactiveOwner = await server.createUser({ username: "legacy_inactive_owner" });
        const deletedOwner = await server.createUser({ username: "legacy_deleted_owner" });
        const database = createClient({ url: server.config.database.url });
        try {
            const main = await database.execute(
                "SELECT id, default_agent_user_id FROM chats WHERE is_main = 1 AND deleted_at IS NULL",
            );
            expect(main.rows).toHaveLength(1);
            const mainId = main.rows[0]!.id as string;
            const agentUserId = main.rows[0]!.default_agent_user_id as string;

            await database.batch(
                [
                    {
                        sql: "UPDATE users SET active = 0 WHERE id = ?",
                        args: [inactiveOwner.id],
                    },
                    {
                        sql: "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
                        args: [deletedOwner.id],
                    },
                    {
                        sql: "UPDATE chats SET owner_user_id = ? WHERE id = ?",
                        args: [agentUserId, mainId],
                    },
                    {
                        sql: `UPDATE chat_members
                            SET role = CASE
                                WHEN user_id IN (?, ?, ?) THEN 'owner'
                                ELSE 'member'
                            END,
                            left_at = CASE WHEN user_id = ? THEN CURRENT_TIMESTAMP ELSE NULL END
                            WHERE chat_id = ?`,
                        args: [
                            agentUserId,
                            inactiveOwner.id,
                            deletedOwner.id,
                            setupOwner.id,
                            mainId,
                        ],
                    },
                ],
                "write",
            );

            await server.restart();

            const repairedMain = await database.execute({
                sql: "SELECT owner_user_id FROM chats WHERE id = ?",
                args: [mainId],
            });
            expect(repairedMain.rows).toEqual([{ owner_user_id: null }]);
            const memberships = await database.execute({
                sql: `SELECT user_id, role, left_at
                    FROM chat_members
                    WHERE chat_id = ? AND user_id IN (?, ?, ?, ?, ?)
                    ORDER BY user_id`,
                args: [
                    mainId,
                    setupOwner.id,
                    preferredMember.id,
                    inactiveOwner.id,
                    deletedOwner.id,
                    agentUserId,
                ],
            });
            expect(memberships.rows).toEqual(
                [
                    { user_id: setupOwner.id, role: "member", left_at: null },
                    { user_id: preferredMember.id, role: "member", left_at: null },
                    { user_id: inactiveOwner.id, role: "admin", left_at: null },
                    { user_id: deletedOwner.id, role: "admin", left_at: null },
                    { user_id: agentUserId, role: "admin", left_at: null },
                ].sort((left, right) => left.user_id.localeCompare(right.user_id)),
            );
            expect(memberships.rows.filter(({ role }) => role === "owner")).toEqual([]);

            await server.restart();
            const stable = await database.execute({
                sql: `SELECT chats.owner_user_id, chat_members.role
                    FROM chats
                    JOIN chat_members
                      ON chat_members.chat_id = chats.id
                     AND chat_members.user_id = ?
                    WHERE chats.id = ?`,
                args: [agentUserId, mainId],
            });
            expect(stable.rows).toEqual([
                expect.objectContaining({
                    owner_user_id: null,
                    role: "admin",
                }),
            ]);
        } finally {
            database.close();
        }
    });
});
