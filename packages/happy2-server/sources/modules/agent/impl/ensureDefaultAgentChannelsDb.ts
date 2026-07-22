import { type DrizzleTransaction } from "../../drizzle.js";
import { chatMembers, chats, users } from "../../schema.js";
import { channelAdvance } from "../../chat/channelAdvance.js";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { channelUpdateInsert } from "../../chat/channelUpdateInsert.js";

import { syncSequenceNext } from "../../sync/syncSequenceNext.js";

import { userJoinAutoChannels } from "../../user/userJoinAutoChannels.js";
import { agentDefaultConversationEnsure } from "../agentDefaultConversationEnsure.js";
import { userAnnounceJoinedServer } from "../../user/userAnnounceJoinedServer.js";
import { projectDefaultEnsure } from "../../project/projectDefaultEnsure.js";

/**
 * Repairs public administration, private human ownership, the main channel, default-agent memberships, and each active human's default-agent conversation.
 * Public channels stay ownerless, private successors come only from their joined active humans, and the caller's transaction keeps the complete default-agent substrate atomic.
 */
export async function ensureDefaultAgentChannelsDb(
    executor: DrizzleTransaction,
    defaultAgentUserId: string,
): Promise<void> {
    const defaultProject = await projectDefaultEnsure(executor);
    let [main] = await executor
        .select({ id: chats.id })
        .from(chats)
        .where(and(eq(chats.isMain, 1), isNull(chats.deletedAt)))
        .limit(1);
    if (!main) {
        const [welcome] = await executor
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.slug, "welcome"), isNull(chats.deletedAt)))
            .limit(1);
        const sequence = await syncSequenceNext(executor);
        if (welcome) {
            await executor
                .update(chats)
                .set({
                    kind: "public_channel",
                    projectId: defaultProject.id,
                    visibility: "public",
                    ownerUserId: null,
                    isListed: 1,
                    archivedAt: null,
                    isMain: 1,
                    autoJoin: 1,
                    defaultAgentUserId,
                    lastChangeSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(chats.id, welcome.id));
            await executor
                .update(chatMembers)
                .set({ role: "admin", updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(and(eq(chatMembers.chatId, welcome.id), eq(chatMembers.role, "owner")));
            await channelAdvance(executor, {
                sequence,
                chatId: welcome.id,
                kind: "chat.mainAssigned",
                entityId: welcome.id,
                actorUserId: defaultAgentUserId,
            });
            main = { id: welcome.id };
        } else {
            const id = createId();
            await executor.insert(chats).values({
                id,
                kind: "public_channel",
                projectId: defaultProject.id,
                name: "Welcome",
                slug: "welcome",
                createdByUserId: defaultAgentUserId,
                ownerUserId: null,
                visibility: "public",
                isListed: 1,
                isMain: 1,
                autoJoin: 1,
                defaultAgentUserId,
                pts: 1,
                lastChangeSequence: sequence,
            });
            await executor.insert(chatMembers).values({
                chatId: id,
                userId: defaultAgentUserId,
                role: "admin",
                membershipEpoch: createId(),
                syncSequence: sequence,
            });
            await channelUpdateInsert(executor, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.created",
                entityId: id,
                actorUserId: defaultAgentUserId,
            });
            main = { id };
        }
    } else {
        await executor
            .update(chats)
            .set({
                projectId: defaultProject.id,
                autoJoin: 1,
                defaultAgentUserId: sql`coalesce(${chats.defaultAgentUserId}, ${defaultAgentUserId})`,
            })
            .where(eq(chats.id, main.id));
    }
    const channels = await executor
        .select({
            id: chats.id,
            kind: chats.kind,
            defaultAgentUserId: chats.defaultAgentUserId,
            ownerUserId: chats.ownerUserId,
        })
        .from(chats)
        .where(and(ne(chats.kind, "dm"), isNull(chats.deletedAt), isNull(chats.archivedAt)))
        .orderBy(chats.id);
    for (const channel of channels) {
        if (channel.kind === "public_channel")
            await repairPublicChannelOwnership(executor, channel.id, channel.ownerUserId);
        else if (channel.kind === "private_channel")
            await repairPrivateChannelHumanOwnership(executor, {
                channelId: channel.id,
                currentOwnerUserId: channel.ownerUserId,
            });

        const [membership] = await executor
            .select({ leftAt: chatMembers.leftAt, role: chatMembers.role })
            .from(chatMembers)
            .where(
                and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, defaultAgentUserId)),
            )
            .limit(1);
        const needsAssignment = channel.defaultAgentUserId === null;
        const requiredRole = channel.id === main.id ? "admin" : "member";
        if (membership?.leftAt === null && membership.role === requiredRole && !needsAssignment)
            continue;
        const sequence = await syncSequenceNext(executor);
        await channelAdvance(executor, {
            sequence,
            chatId: channel.id,
            kind: needsAssignment ? "chat.defaultAgentAssigned" : "member.defaultAgentJoined",
            entityId: defaultAgentUserId,
            actorUserId: defaultAgentUserId,
        });
        if (needsAssignment)
            await executor
                .update(chats)
                .set({ defaultAgentUserId })
                .where(and(eq(chats.id, channel.id), isNull(chats.defaultAgentUserId)));
        await executor
            .insert(chatMembers)
            .values({
                chatId: channel.id,
                userId: defaultAgentUserId,
                role: requiredRole,
                membershipEpoch: createId(),
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: {
                    role: requiredRole,
                    membershipEpoch: sql`excluded.membership_epoch`,
                    syncSequence: sequence,
                    joinedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    leftAt: null,
                },
            });
    }
    const activeUsers = await executor
        .select({
            id: users.id,
            username: users.username,
        })
        .from(users)
        .where(and(eq(users.kind, "human"), eq(users.active, 1), isNull(users.deletedAt)))
        .orderBy(users.id);
    for (const user of activeUsers) {
        const [mainMembership] = await executor
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.chatId, main.id),
                    eq(chatMembers.userId, user.id),
                    isNull(chatMembers.leftAt),
                ),
            )
            .limit(1);
        await userJoinAutoChannels(executor, user, undefined, main.id);
        await agentDefaultConversationEnsure(executor, { userId: user.id });
        if (!mainMembership)
            await userAnnounceJoinedServer(
                executor,
                user,
                defaultAgentUserId,
                await syncSequenceNext(executor),
            );
    }
}

async function repairPublicChannelOwnership(
    executor: DrizzleTransaction,
    channelId: string,
    currentOwnerUserId: string | null,
): Promise<void> {
    const ownerMemberships = await executor
        .select({ userId: chatMembers.userId })
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, channelId), eq(chatMembers.role, "owner")));
    if (currentOwnerUserId === null && ownerMemberships.length === 0) return;
    const sequence = await syncSequenceNext(executor);
    if (currentOwnerUserId !== null)
        await executor
            .update(chats)
            .set({ ownerUserId: null, updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(chats.id, channelId));
    if (ownerMemberships.length)
        await executor
            .update(chatMembers)
            .set({
                role: "admin",
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, channelId),
                    inArray(
                        chatMembers.userId,
                        ownerMemberships.map(({ userId }) => userId),
                    ),
                    eq(chatMembers.role, "owner"),
                ),
            );
    await channelAdvance(executor, {
        sequence,
        chatId: channelId,
        kind: "chat.ownerRepaired",
        entityId: channelId,
    });
}

async function repairPrivateChannelHumanOwnership(
    executor: DrizzleTransaction,
    input: {
        channelId: string;
        currentOwnerUserId: string | null;
    },
): Promise<void> {
    const owner = await privateChannelOwnerCandidate(
        executor,
        input.channelId,
        input.currentOwnerUserId,
    );
    const ownerMemberships = await executor
        .select({
            active: users.active,
            deletedAt: users.deletedAt,
            kind: users.kind,
            leftAt: chatMembers.leftAt,
            userId: chatMembers.userId,
        })
        .from(chatMembers)
        .leftJoin(users, eq(users.id, chatMembers.userId))
        .where(and(eq(chatMembers.chatId, input.channelId), eq(chatMembers.role, "owner")));
    const invalidOwnerUserIds = ownerMemberships
        .filter(
            (membership) =>
                membership.leftAt !== null ||
                membership.kind !== "human" ||
                membership.active !== 1 ||
                membership.deletedAt !== null,
        )
        .map(({ userId }) => userId);
    const supersededOwnerUserIds = ownerMemberships
        .filter(
            (membership) =>
                membership.userId !== owner?.id &&
                membership.leftAt === null &&
                membership.kind === "human" &&
                membership.active === 1 &&
                membership.deletedAt === null,
        )
        .map(({ userId }) => userId);
    const ownerChanged = input.currentOwnerUserId !== (owner?.id ?? null);
    const membershipNeedsPromotion = Boolean(owner && owner.membershipRole !== "owner");
    if (
        !ownerChanged &&
        invalidOwnerUserIds.length === 0 &&
        supersededOwnerUserIds.length === 0 &&
        !membershipNeedsPromotion
    )
        return;
    const sequence = await syncSequenceNext(executor);
    if (ownerChanged)
        await executor
            .update(chats)
            .set({ ownerUserId: owner?.id ?? null, updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(chats.id, input.channelId));
    if (invalidOwnerUserIds.length)
        await executor
            .update(chatMembers)
            .set({
                role: "member",
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, input.channelId),
                    inArray(chatMembers.userId, invalidOwnerUserIds),
                    eq(chatMembers.role, "owner"),
                ),
            );
    if (supersededOwnerUserIds.length)
        await executor
            .update(chatMembers)
            .set({
                role: "admin",
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, input.channelId),
                    inArray(chatMembers.userId, supersededOwnerUserIds),
                    eq(chatMembers.role, "owner"),
                ),
            );
    if (owner && membershipNeedsPromotion)
        await ensureOwnerMembership(executor, input.channelId, owner.id, sequence);
    await channelAdvance(executor, {
        sequence,
        chatId: input.channelId,
        kind: "chat.ownerRepaired",
        entityId: owner?.id ?? input.channelId,
        actorUserId: owner?.id,
    });
}

async function privateChannelOwnerCandidate(
    executor: DrizzleTransaction,
    channelId: string,
    currentOwnerUserId: string | null,
): Promise<{ id: string; membershipRole: string } | undefined> {
    const [member] = await executor
        .select({ id: users.id, membershipRole: chatMembers.role })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .where(
            and(
                eq(chatMembers.chatId, channelId),
                isNull(chatMembers.leftAt),
                eq(users.kind, "human"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .orderBy(
            currentOwnerUserId
                ? sql`case when ${users.id} = ${currentOwnerUserId} then 0 when ${chatMembers.role} = 'owner' then 1 when ${chatMembers.role} = 'admin' then 2 else 3 end`
                : sql`case when ${chatMembers.role} = 'owner' then 0 when ${chatMembers.role} = 'admin' then 1 else 2 end`,
            chatMembers.joinedAt,
            chatMembers.userId,
        )
        .limit(1);
    return member;
}

async function ensureOwnerMembership(
    executor: DrizzleTransaction,
    channelId: string,
    ownerUserId: string,
    sequence: number,
): Promise<void> {
    const [membership] = await executor
        .update(chatMembers)
        .set({
            role: "owner",
            syncSequence: sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
            leftAt: null,
        })
        .where(and(eq(chatMembers.chatId, channelId), eq(chatMembers.userId, ownerUserId)))
        .returning({ userId: chatMembers.userId });
    if (!membership) throw new Error("Channel owner membership is missing");
}
