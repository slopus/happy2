import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { createDatabase, type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    agentImages,
    chatMembers,
    chats,
    messages,
    serverSetupState,
    serverSyncState,
    users,
} from "../schema.js";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { syncInitialize } from "../sync/syncInitialize.js";
import { projectDefaultEnsure } from "../project/projectDefaultEnsure.js";
import { agentDefaultRepair } from "./agentDefaultRepair.js";

const setupOwnerUserId = "default-channel-setup-owner";
const preferredOwnerUserId = "default-channel-member-owner";
const inactiveOwnerUserId = "default-channel-inactive-owner";
const deletedOwnerUserId = "default-channel-deleted-owner";
const defaultAgentUserId = "default-channel-agent";
const defaultAgentImageId = "default-channel-agent-image";
const mainChatId = "default-channel-main";
const ordinaryChannelId = "default-channel-ordinary";

describe("default agent channel human ownership", () => {
    let client: Client;
    let directory: string;
    let executor: DrizzleExecutor;
    let projectId: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-default-channel-owner-"));
        client = createClient({ url: `file:${join(directory, "happy2.db")}` });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        await syncInitialize(executor);
        projectId = (await withTransaction(executor, (tx) => projectDefaultEnsure(tx))).id;
        await executor.insert(agentImages).values({
            id: defaultAgentImageId,
            buildProgress: 100,
            definitionHash: "default-channel-agent-image-hash",
            dockerImageId: "sha256:default-channel-agent-image",
            dockerTag: "happy2:default-channel-agent-image",
            dockerfile: "FROM scratch",
            name: "Default channel agent image",
            readyAt: new Date().toISOString(),
            status: "ready",
        });
    });

    afterEach(async () => {
        client.close();
        await rm(directory, { force: true, recursive: true });
    });

    it("creates an ownerless resumable main channel with the default agent as administrator", async () => {
        await executor
            .insert(users)
            .values([human(setupOwnerUserId, "local_setup_owner"), defaultAgent()]);
        await setSetupOwner(executor, setupOwnerUserId);

        await agentDefaultRepair(executor);

        const [main] = await executor
            .select({
                createdByUserId: chats.createdByUserId,
                defaultAgentUserId: chats.defaultAgentUserId,
                id: chats.id,
                ownerUserId: chats.ownerUserId,
            })
            .from(chats)
            .where(eq(chats.isMain, 1));
        expect(main).toMatchObject({
            createdByUserId: defaultAgentUserId,
            defaultAgentUserId,
            ownerUserId: null,
        });
        await expect(membershipRoles(executor, main!.id)).resolves.toEqual([
            { role: "admin", userId: defaultAgentUserId },
            { role: "member", userId: setupOwnerUserId },
        ]);
        const serviceTypes = (
            await executor.select({ contentJson: messages.contentJson }).from(messages)
        )
            .map(
                ({ contentJson }) =>
                    JSON.parse(contentJson ?? "{}") as { service?: { type?: string } },
            )
            .map(({ service }) => service?.type)
            .filter(Boolean)
            .sort();
        expect(serviceTypes).toEqual(["user_added", "user_joined"]);

        const sequence = await currentSequence(executor);
        const messageCount = await messageCountFor(executor, main!.id);
        await expect(agentDefaultRepair(executor)).resolves.toBeUndefined();
        await expect(currentSequence(executor)).resolves.toBe(sequence);
        await expect(messageCountFor(executor, main!.id)).resolves.toBe(messageCount);
    });

    it("clears public ownership and repairs private ownership without a setup-owner fallback", async () => {
        await executor.insert(users).values([
            human(setupOwnerUserId, "legacy_setup_owner"),
            human(preferredOwnerUserId, "legacy_member_owner"),
            { ...human(inactiveOwnerUserId, "legacy_inactive_owner"), active: 0 },
            {
                ...human(deletedOwnerUserId, "legacy_deleted_owner"),
                deletedAt: "2025-01-01T00:00:00.000Z",
            },
            defaultAgent(),
        ]);
        await setSetupOwner(executor, setupOwnerUserId);
        await executor
            .insert(chats)
            .values([
                channel(mainChatId, projectId, { isMain: 1, autoJoin: 1 }),
                channel(ordinaryChannelId, projectId, { kind: "private_channel" }),
            ]);
        await executor.insert(chatMembers).values([
            membership(mainChatId, defaultAgentUserId, "owner"),
            membership(mainChatId, preferredOwnerUserId, "member"),
            membership(mainChatId, inactiveOwnerUserId, "owner"),
            membership(mainChatId, deletedOwnerUserId, "owner"),
            {
                ...membership(mainChatId, setupOwnerUserId, "member"),
                leftAt: "2025-01-01T00:00:00.000Z",
            },
            membership(ordinaryChannelId, defaultAgentUserId, "owner"),
            membership(ordinaryChannelId, inactiveOwnerUserId, "owner"),
            membership(ordinaryChannelId, preferredOwnerUserId, "admin"),
            {
                ...membership(ordinaryChannelId, setupOwnerUserId, "member"),
                leftAt: "2025-01-01T00:00:00.000Z",
            },
        ]);

        await agentDefaultRepair(executor);

        const repaired = await executor
            .select({ id: chats.id, ownerUserId: chats.ownerUserId })
            .from(chats)
            .where(inArray(chats.id, [mainChatId, ordinaryChannelId]))
            .orderBy(chats.id);
        expect(repaired).toEqual([
            { id: mainChatId, ownerUserId: null },
            { id: ordinaryChannelId, ownerUserId: preferredOwnerUserId },
        ]);
        await expect(membershipStates(executor, mainChatId)).resolves.toEqual([
            { leftAt: null, role: "admin", userId: defaultAgentUserId },
            {
                leftAt: null,
                role: "admin",
                userId: deletedOwnerUserId,
            },
            {
                leftAt: null,
                role: "admin",
                userId: inactiveOwnerUserId,
            },
            { leftAt: null, role: "member", userId: preferredOwnerUserId },
            { leftAt: null, role: "member", userId: setupOwnerUserId },
        ]);
        await expect(membershipStates(executor, ordinaryChannelId)).resolves.toEqual([
            { leftAt: null, role: "member", userId: defaultAgentUserId },
            {
                leftAt: null,
                role: "member",
                userId: inactiveOwnerUserId,
            },
            { leftAt: null, role: "owner", userId: preferredOwnerUserId },
            {
                leftAt: "2025-01-01T00:00:00.000Z",
                role: "member",
                userId: setupOwnerUserId,
            },
        ]);
        const mainRepairSequences = await executor
            .select({ syncSequence: chatMembers.syncSequence, userId: chatMembers.userId })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.chatId, mainChatId),
                    inArray(chatMembers.userId, [
                        defaultAgentUserId,
                        inactiveOwnerUserId,
                        deletedOwnerUserId,
                    ]),
                ),
            );
        expect(new Set(mainRepairSequences.map(({ syncSequence }) => syncSequence)).size).toBe(1);
        expect(mainRepairSequences[0]!.syncSequence).toBeGreaterThan(0);

        const sequence = await currentSequence(executor);
        await expect(agentDefaultRepair(executor)).resolves.toBeUndefined();
        await expect(currentSequence(executor)).resolves.toBe(sequence);
    });

    it("clears agent ownership and keeps the default agent as a member when no active human exists", async () => {
        await executor
            .insert(users)
            .values([
                { ...human(setupOwnerUserId, "unavailable_setup_owner"), active: 0 },
                defaultAgent(),
            ]);
        await setSetupOwner(executor, setupOwnerUserId);
        await executor
            .insert(chats)
            .values(channel(mainChatId, projectId, { isMain: 1, autoJoin: 1 }));
        await executor
            .insert(chatMembers)
            .values(membership(mainChatId, defaultAgentUserId, "owner"));

        await agentDefaultRepair(executor);

        const [main] = await executor
            .select({ ownerUserId: chats.ownerUserId })
            .from(chats)
            .where(eq(chats.id, mainChatId));
        expect(main?.ownerUserId).toBeNull();
        await expect(membershipRoles(executor, mainChatId)).resolves.toEqual([
            { role: "admin", userId: defaultAgentUserId },
        ]);
    });
});

function human(id: string, username: string) {
    return {
        id,
        active: 1,
        firstName: username,
        kind: "human",
        role: "admin",
        username,
    };
}

function defaultAgent() {
    return {
        id: defaultAgentUserId,
        active: 1,
        agentImageId: defaultAgentImageId,
        agentRole: "default",
        firstName: "Happy",
        kind: "agent",
        role: "member",
        username: "default_channel_agent",
    };
}

function channel(
    id: string,
    projectId: string,
    overrides: {
        autoJoin?: number;
        isMain?: number;
        kind?: "private_channel" | "public_channel";
    } = {},
) {
    const kind = overrides.kind ?? "public_channel";
    return {
        id,
        autoJoin: overrides.autoJoin ?? 0,
        createdByUserId: defaultAgentUserId,
        defaultAgentUserId,
        isMain: overrides.isMain ?? 0,
        kind,
        name: id,
        ownerUserId: defaultAgentUserId,
        projectId,
        slug: id,
        visibility: kind === "public_channel" ? "public" : "private",
    };
}

function membership(chatId: string, userId: string, role: string) {
    return {
        chatId,
        membershipEpoch: `${chatId}:${userId}`,
        role,
        userId,
    };
}

async function setSetupOwner(executor: DrizzleExecutor, userId: string): Promise<void> {
    await executor
        .update(serverSetupState)
        .set({ bootstrapAdminUserId: userId })
        .where(eq(serverSetupState.id, 1));
}

async function currentSequence(executor: DrizzleExecutor): Promise<number> {
    const [state] = await executor
        .select({ sequence: serverSyncState.sequence })
        .from(serverSyncState)
        .where(eq(serverSyncState.id, 1));
    return state!.sequence;
}

async function messageCountFor(executor: DrizzleExecutor, chatId: string): Promise<number> {
    const rows = await executor
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.chatId, chatId));
    return rows.length;
}

function membershipRoles(executor: DrizzleExecutor, chatId: string) {
    return executor
        .select({ role: chatMembers.role, userId: chatMembers.userId })
        .from(chatMembers)
        .where(eq(chatMembers.chatId, chatId))
        .orderBy(chatMembers.userId);
}

function membershipStates(executor: DrizzleExecutor, chatId: string) {
    return executor
        .select({
            leftAt: chatMembers.leftAt,
            role: chatMembers.role,
            userId: chatMembers.userId,
        })
        .from(chatMembers)
        .where(eq(chatMembers.chatId, chatId))
        .orderBy(chatMembers.userId);
}
