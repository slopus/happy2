import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accountCreatePassword } from "../auth/accountCreatePassword.js";
import { createDatabase, type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { projectDefaultEnsure } from "../project/projectDefaultEnsure.js";
import { userCreateProfile } from "../user/userCreateProfile.js";
import { userDelete } from "../user/userDelete.js";
import { userSetBanned } from "../user/userSetBanned.js";
import { accountBanApply } from "./accountBanApply.js";
import { accountBanExpireDue } from "./accountBanExpireDue.js";
import { accountBanRevoke } from "./accountBanRevoke.js";
import { moderationActionTake } from "./moderationActionTake.js";
import { moderationReportCreate } from "./moderationReportCreate.js";

describe("human deactivation channel ownership", () => {
    let client: Client;
    let directory: string;
    let executor: DrizzleExecutor;
    let admin: TestUser;
    let projectId: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-deactivation-ownership-"));
        client = createClient({ url: `file:${join(directory, "happy2.db")}` });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        projectId = (await withTransaction(executor, (tx) => projectDefaultEnsure(tx))).id;
        admin = await createUser(executor, "deactivation_admin");
    });

    afterEach(async () => {
        client.close();
        await rm(directory, { force: true, recursive: true });
    });

    it("uses owner rank then joinedAt and never returns ownership after revoke", async () => {
        const target = await createUser(executor, "rank_target");
        const laterOwner = await createUser(executor, "rank_later_owner");
        const earlierOwner = await createUser(executor, "rank_earlier_owner");
        const adminMember = await createUser(executor, "rank_admin_member");
        const ordinaryMember = await createUser(executor, "rank_ordinary_member");
        const chatId = await createChannel(client, projectId, "ranked-successor", target.id, [
            member(target.id, "owner", "2024-01-01T00:00:00.000Z"),
            member(laterOwner.id, "owner", "2024-01-04T00:00:00.000Z"),
            member(earlierOwner.id, "owner", "2024-01-03T00:00:00.000Z"),
            member(adminMember.id, "admin", "2024-01-02T00:00:00.000Z"),
            member(ordinaryMember.id, "member", "2024-01-01T00:00:00.000Z"),
        ]);

        await accountBanApply(executor, {
            actorUserId: admin.id,
            targetUserId: target.id,
            reason: "ownership test",
        });

        await expect(channelState(client, chatId)).resolves.toMatchObject({
            owner_user_id: earlierOwner.id,
        });
        await expect(membershipRole(client, chatId, target.id)).resolves.toBe("member");
        await expect(membershipRole(client, chatId, laterOwner.id)).resolves.toBe("admin");
        const evidence = await client.execute({
            sql: `SELECT chats.last_change_sequence, users.sync_sequence, chat_updates.kind
                FROM chats
                JOIN users ON users.id = ?
                JOIN chat_updates ON chat_updates.chat_id = chats.id AND chat_updates.pts = chats.pts
                WHERE chats.id = ?`,
            args: [target.id, chatId],
        });
        expect(evidence.rows[0]).toMatchObject({
            kind: "chat.ownerTransferredForDeactivation",
        });
        expect(evidence.rows[0]!.last_change_sequence).toBe(evidence.rows[0]!.sync_sequence);

        await accountBanRevoke(executor, {
            actorUserId: admin.id,
            targetUserId: target.id,
            reason: "appeal accepted",
        });
        await expect(channelState(client, chatId)).resolves.toMatchObject({
            owner_user_id: earlierOwner.id,
        });
        await expect(membershipRole(client, chatId, target.id)).resolves.toBe("member");
    });

    it("clears sole ownership without deleting main or ordinary channels and unban does not reclaim", async () => {
        const target = await createUser(executor, "sole_target");
        const ordinaryId = await createChannel(client, projectId, "sole-ordinary", target.id, [
            member(target.id, "owner", "2024-01-01T00:00:00.000Z"),
        ]);
        const mainId = await createChannel(
            client,
            projectId,
            "sole-main",
            target.id,
            [member(target.id, "owner", "2024-01-01T00:00:00.000Z")],
            true,
        );

        const banned = await userSetBanned(executor, {
            actorUserId: admin.id,
            userId: target.id,
            banned: true,
        });

        expect(banned.hint.chats.map(({ chatId }) => chatId).sort()).toEqual(
            [mainId, ordinaryId].sort(),
        );
        for (const chatId of [mainId, ordinaryId])
            await expect(channelState(client, chatId)).resolves.toMatchObject({
                deleted_at: null,
                owner_user_id: null,
            });
        await expect(membershipRole(client, ordinaryId, target.id)).resolves.toBe("member");
        await expect(membershipRole(client, mainId, target.id)).resolves.toBe("admin");

        await userSetBanned(executor, {
            actorUserId: admin.id,
            userId: target.id,
            banned: false,
        });
        for (const chatId of [mainId, ordinaryId])
            await expect(channelState(client, chatId)).resolves.toMatchObject({
                owner_user_id: null,
            });
    });

    it("report-driven bans prefer an admin membership over a member and return chat evidence", async () => {
        const target = await createUser(executor, "report_target");
        const adminMember = await createUser(executor, "report_admin_member");
        const ordinaryMember = await createUser(executor, "report_ordinary_member");
        const chatId = await createChannel(client, projectId, "report-successor", target.id, [
            member(target.id, "owner", "2024-01-01T00:00:00.000Z"),
            member(ordinaryMember.id, "member", "2024-01-02T00:00:00.000Z"),
            member(adminMember.id, "admin", "2024-01-03T00:00:00.000Z"),
        ]);
        const report = await moderationReportCreate(executor, {
            actorUserId: admin.id,
            targetUserId: target.id,
            reason: "review ownership transfer",
        });

        const action = await moderationActionTake(executor, {
            actorUserId: admin.id,
            reportId: report.id,
            action: "ban",
            reason: "confirmed",
        });

        expect(action.sync?.chats).toEqual([
            expect.objectContaining({ chatId, pts: expect.any(String) }),
        ]);
        await expect(channelState(client, chatId)).resolves.toMatchObject({
            owner_user_id: adminMember.id,
        });
        await expect(membershipRole(client, chatId, adminMember.id)).resolves.toBe("owner");
    });

    it("uses a member as the final fallback and expiry does not reclaim ownership", async () => {
        const target = await createUser(executor, "expiry_target");
        const successor = await createUser(executor, "expiry_member");
        const chatId = await createChannel(client, projectId, "expiry-successor", target.id, [
            member(target.id, "owner", "2024-01-01T00:00:00.000Z"),
            member(successor.id, "member", "2024-01-02T00:00:00.000Z"),
        ]);
        await accountBanApply(executor, {
            actorUserId: admin.id,
            targetUserId: target.id,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        await client.execute({
            sql: "UPDATE accounts SET ban_expires_at = ? WHERE id = ?",
            args: [new Date(Date.now() - 1_000).toISOString(), target.accountId],
        });
        await client.execute({
            sql: "UPDATE account_bans SET expires_at = ? WHERE account_id = ?",
            args: [new Date(Date.now() - 1_000).toISOString(), target.accountId],
        });

        await expect(accountBanExpireDue(executor)).resolves.toBe(1);

        await expect(channelState(client, chatId)).resolves.toMatchObject({
            owner_user_id: successor.id,
        });
        await expect(membershipRole(client, chatId, successor.id)).resolves.toBe("owner");
        await expect(membershipRole(client, chatId, target.id)).resolves.toBe("member");
        const active = await client.execute({
            sql: "SELECT active FROM users WHERE id = ?",
            args: [target.id],
        });
        expect(active.rows[0]).toMatchObject({ active: 1 });
    });

    it("deletes an orphaned ordinary channel but preserves an orphaned main channel", async () => {
        const target = await createUser(executor, "deleted_sole_target");
        const ordinaryId = await createChannel(
            client,
            projectId,
            "deleted-sole-ordinary",
            target.id,
            [member(target.id, "owner", "2024-01-01T00:00:00.000Z")],
        );
        const mainId = await createChannel(
            client,
            projectId,
            "deleted-sole-main",
            target.id,
            [member(target.id, "owner", "2024-01-01T00:00:00.000Z")],
            true,
        );

        const deleted = await userDelete(executor, {
            actorUserId: admin.id,
            userId: target.id,
        });

        expect(deleted.hint.chats.map(({ chatId }) => chatId).sort()).toEqual(
            [mainId, ordinaryId].sort(),
        );
        await expect(channelState(client, ordinaryId)).resolves.toMatchObject({
            deleted_at: expect.any(String),
            owner_user_id: null,
        });
        await expect(channelState(client, mainId)).resolves.toMatchObject({
            deleted_at: null,
            owner_user_id: null,
        });
        await expect(membershipRole(client, mainId, target.id)).resolves.toBe("admin");
    });

    it("never transfers or deletes a public channel with legacy owners", async () => {
        const target = await createUser(executor, "public_legacy_target");
        const other = await createUser(executor, "public_legacy_other");
        const publicId = await createChannel(
            client,
            projectId,
            "public-legacy-owners",
            target.id,
            [
                member(target.id, "owner", "2024-01-01T00:00:00.000Z"),
                member(other.id, "owner", "2024-01-02T00:00:00.000Z"),
            ],
            true,
        );

        await userDelete(executor, {
            actorUserId: admin.id,
            userId: target.id,
        });

        await expect(channelState(client, publicId)).resolves.toMatchObject({
            deleted_at: null,
            owner_user_id: null,
        });
        await expect(membershipRole(client, publicId, target.id)).resolves.toBe("admin");
        await expect(membershipRole(client, publicId, other.id)).resolves.toBe("admin");
    });
});

interface TestUser {
    accountId: string;
    id: string;
}

interface TestMembership {
    joinedAt: string;
    role: "admin" | "member" | "owner";
    userId: string;
}

async function createUser(executor: DrizzleExecutor, username: string): Promise<TestUser> {
    const account = await accountCreatePassword(
        executor,
        `${username}@example.test`,
        "not-used-by-this-test",
    );
    const user = await userCreateProfile(
        executor,
        account.id,
        { firstName: username, username, email: `${username}@example.test` },
        { provisioned: true },
    );
    return { accountId: account.id, id: user.id };
}

function member(userId: string, role: TestMembership["role"], joinedAt: string): TestMembership {
    return { joinedAt, role, userId };
}

async function createChannel(
    client: Client,
    projectId: string,
    slug: string,
    ownerUserId: string,
    memberships: TestMembership[],
    isMain = false,
): Promise<string> {
    const id = `deactivation-${slug}`;
    await client.execute({
        sql: `INSERT INTO chats
            (id, kind, project_id, name, slug, owner_user_id, visibility, is_listed, is_main, auto_join)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        args: [
            id,
            isMain ? "public_channel" : "private_channel",
            projectId,
            slug,
            slug,
            ownerUserId,
            isMain ? "public" : "private",
            isMain ? 1 : 0,
            isMain ? 1 : 0,
        ],
    });
    for (const membership of memberships)
        await client.execute({
            sql: `INSERT INTO chat_members
                (chat_id, user_id, role, membership_epoch, joined_at)
                VALUES (?, ?, ?, ?, ?)`,
            args: [
                id,
                membership.userId,
                membership.role,
                `${id}:${membership.userId}`,
                membership.joinedAt,
            ],
        });
    return id;
}

async function channelState(client: Client, chatId: string) {
    const result = await client.execute({
        sql: "SELECT owner_user_id, deleted_at FROM chats WHERE id = ?",
        args: [chatId],
    });
    return result.rows[0];
}

async function membershipRole(client: Client, chatId: string, userId: string) {
    const result = await client.execute({
        sql: "SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?",
        args: [chatId, userId],
    });
    return result.rows[0]?.role;
}
