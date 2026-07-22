import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient, type GymUser } from "../../sources/index.js";

describe("ban channel ownership transfer", () => {
    it("repairs co-owner and sole-owner channels while revoke and expiry never reclaim", async () => {
        await using server = await createGymServer({ databaseMode: "file" });
        const administrator = await server.createUser({ username: "ban_owner_admin" });
        const target = await server.createUser({ username: "ban_owner_target" });
        const earlierOwner = await server.createUser({ username: "ban_owner_earlier" });
        const laterOwner = await server.createUser({ username: "ban_owner_later" });
        const adminMember = await server.createUser({ username: "ban_owner_channel_admin" });
        const ordinaryMember = await server.createUser({ username: "ban_owner_member" });
        const expiringTarget = await server.createUser({ username: "ban_expiry_target" });
        const expirySuccessor = await server.createUser({ username: "ban_expiry_successor" });
        const asAdministrator = server.as(administrator);
        const asTarget = server.as(target);
        const rankedChatId = await createChannel(asTarget, "ban-ranked-successor", [
            [earlierOwner, "owner"],
            [laterOwner, "owner"],
            [adminMember, "admin"],
            [ordinaryMember, "member"],
        ]);
        const soleChatId = await createChannel(asTarget, "ban-sole-owner", []);
        const expiryChatId = await createChannel(
            server.as(expiringTarget),
            "ban-expiry-successor",
            [[expirySuccessor, "member"]],
        );
        const database = createClient({ url: server.config.database.url });
        try {
            await database.batch(
                [
                    {
                        sql: "UPDATE chats SET owner_user_id = ? WHERE id = ?",
                        args: [target.id, rankedChatId],
                    },
                    {
                        sql: `UPDATE chat_members SET role = 'owner'
                            WHERE chat_id = ? AND user_id IN (?, ?)`,
                        args: [rankedChatId, earlierOwner.id, laterOwner.id],
                    },
                    {
                        sql: "UPDATE chat_members SET joined_at = ? WHERE chat_id = ? AND user_id = ?",
                        args: ["2024-01-02T00:00:00.000Z", rankedChatId, earlierOwner.id],
                    },
                    {
                        sql: "UPDATE chat_members SET joined_at = ? WHERE chat_id = ? AND user_id = ?",
                        args: ["2024-01-03T00:00:00.000Z", rankedChatId, laterOwner.id],
                    },
                    {
                        sql: "UPDATE chat_members SET joined_at = ? WHERE chat_id = ? AND user_id = ?",
                        args: ["2024-01-01T00:00:00.000Z", rankedChatId, adminMember.id],
                    },
                ],
                "write",
            );

            const banned = await asAdministrator.post(`/v0/admin/users/${target.id}/banUser`);
            expect(banned.statusCode).toBe(200);
            await expect(channelState(database, rankedChatId)).resolves.toMatchObject({
                owner_user_id: earlierOwner.id,
                deleted_at: null,
            });
            await expect(channelState(database, soleChatId)).resolves.toMatchObject({
                owner_user_id: null,
                deleted_at: null,
            });
            await expect(membershipRole(database, rankedChatId, target.id)).resolves.toBe("member");
            expect(
                (
                    await database.execute({
                        sql: `SELECT kind FROM chat_updates
                            WHERE chat_id = ? ORDER BY pts DESC LIMIT 1`,
                        args: [rankedChatId],
                    })
                ).rows[0],
            ).toMatchObject({ kind: "chat.ownerTransferredForDeactivation" });

            const unbanned = await asAdministrator.post(`/v0/admin/users/${target.id}/unbanUser`);
            expect(unbanned.statusCode).toBe(200);
            await expect(channelState(database, rankedChatId)).resolves.toMatchObject({
                owner_user_id: earlierOwner.id,
            });
            await expect(channelState(database, soleChatId)).resolves.toMatchObject({
                owner_user_id: null,
            });

            const expiresAt = new Date(Date.now() + 250).toISOString();
            const expiringBan = await asAdministrator.post(
                `/v0/admin/users/${expiringTarget.id}/applyBan`,
                { reason: "temporary", expiresAt },
            );
            expect(expiringBan.statusCode).toBe(201);
            await expect(channelState(database, expiryChatId)).resolves.toMatchObject({
                owner_user_id: expirySuccessor.id,
            });
            await waitUntil(Date.parse(expiresAt));
            const expired = await asAdministrator.post("/v0/admin/expireBans", {});
            expect(expired.statusCode).toBe(200);
            expect(expired.json().expired).toBeGreaterThanOrEqual(1);
            await expect(channelState(database, expiryChatId)).resolves.toMatchObject({
                owner_user_id: expirySuccessor.id,
            });
            expect(
                (
                    await database.execute({
                        sql: "SELECT active FROM users WHERE id = ?",
                        args: [expiringTarget.id],
                    })
                ).rows[0],
            ).toMatchObject({ active: 1 });
        } finally {
            database.close();
        }
    });
});

async function createChannel(
    client: GymRequestClient,
    slug: string,
    members: Array<[GymUser, "admin" | "member" | "owner"]>,
): Promise<string> {
    const created = await client.post("/v0/chats/createChannel", {
        kind: "private_channel",
        name: slug,
        slug,
    });
    expect(created.statusCode).toBe(201);
    const chatId = created.json().chat.id as string;
    for (const [user, role] of members) {
        const added = await client.post(`/v0/chats/${chatId}/addMember`, { userId: user.id });
        expect(added.statusCode).toBe(200);
        if (role === "admin") {
            const changed = await client.post(`/v0/chats/${chatId}/setMemberRole`, {
                userId: user.id,
                role,
            });
            expect(changed.statusCode).toBe(200);
        }
    }
    return chatId;
}

async function channelState(client: ReturnType<typeof createClient>, chatId: string) {
    const result = await client.execute({
        sql: "SELECT owner_user_id, deleted_at FROM chats WHERE id = ?",
        args: [chatId],
    });
    return result.rows[0];
}

async function membershipRole(
    client: ReturnType<typeof createClient>,
    chatId: string,
    userId: string,
) {
    const result = await client.execute({
        sql: "SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?",
        args: [chatId, userId],
    });
    return result.rows[0]?.role;
}

async function waitUntil(timestamp: number): Promise<void> {
    while (Date.now() <= timestamp) await new Promise((resolve) => setTimeout(resolve, 10));
}
