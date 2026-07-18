import { type DrizzleTransaction } from "../../drizzle.js";
import { accounts, chatMembers, chats, users } from "../../schema.js";
import { channelAdvance } from "../../chat/channelAdvance.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { channelUpdateInsert } from "../../chat/channelUpdateInsert.js";

import { syncSequenceNext } from "../../sync/syncSequenceNext.js";

import { userJoinAutoChannels } from "../../user/userJoinAutoChannels.js";
import { agentDefaultConversationEnsure } from "../agentDefaultConversationEnsure.js";
import { userAnnounceJoinedServer } from "../../user/userAnnounceJoinedServer.js";
/**
 * Repairs the main channel, default-agent memberships, and each active human's default-agent conversation after the agent exists.
 * The caller owns one transaction so no product surface can observe only part of the required default-agent substrate.
 */
export async function ensureDefaultAgentChannelsDb(
    executor: DrizzleTransaction,
    defaultAgentUserId: string,
): Promise<void> {
    let [main] = await executor
        .select({
            id: chats.id,
        })
        .from(chats)
        .where(and(eq(chats.isMain, 1), isNull(chats.deletedAt)))
        .limit(1);
    if (!main) {
        const [welcome] = await executor
            .select({
                id: chats.id,
            })
            .from(chats)
            .where(and(eq(chats.slug, "welcome"), isNull(chats.deletedAt)))
            .limit(1);
        const sequence = await syncSequenceNext(executor);
        if (welcome) {
            await executor
                .update(chats)
                .set({
                    kind: "public_channel",
                    visibility: "public",
                    isListed: 1,
                    archivedAt: null,
                    isMain: 1,
                    autoJoin: 1,
                    defaultAgentUserId,
                    lastChangeSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(chats.id, welcome.id));
            await channelAdvance(executor, {
                sequence,
                chatId: welcome.id,
                kind: "chat.mainAssigned",
                entityId: welcome.id,
                actorUserId: defaultAgentUserId,
            });
            main = {
                id: welcome.id,
            };
        } else {
            const id = createId();
            await executor.insert(chats).values({
                id,
                kind: "public_channel",
                name: "Welcome",
                slug: "welcome",
                createdByUserId: defaultAgentUserId,
                ownerUserId: defaultAgentUserId,
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
                role: "owner",
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
            main = {
                id,
            };
        }
    } else {
        await executor
            .update(chats)
            .set({
                autoJoin: 1,
                defaultAgentUserId: sql`coalesce(${chats.defaultAgentUserId}, ${defaultAgentUserId})`,
            })
            .where(eq(chats.id, main.id));
    }
    const channels = await executor
        .select({
            id: chats.id,
            defaultAgentUserId: chats.defaultAgentUserId,
        })
        .from(chats)
        .where(and(ne(chats.kind, "dm"), isNull(chats.deletedAt)));
    for (const channel of channels) {
        for (const participant of [{ id: defaultAgentUserId, kind: "member.defaultAgentJoined" }]) {
            const [membership] = await executor
                .select({ leftAt: chatMembers.leftAt })
                .from(chatMembers)
                .where(
                    and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, participant.id)),
                )
                .limit(1);
            const needsAssignment = channel.defaultAgentUserId === null;
            if (membership?.leftAt === null && !needsAssignment) continue;
            const sequence = await syncSequenceNext(executor);
            await channelAdvance(executor, {
                sequence,
                chatId: channel.id,
                kind: needsAssignment ? "chat.defaultAgentAssigned" : participant.kind,
                entityId: participant.id,
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
                    userId: participant.id,
                    role:
                        participant.id === defaultAgentUserId && channel.id === main.id
                            ? "owner"
                            : "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        role: channel.id === main.id ? "owner" : "member",
                        membershipEpoch: sql`excluded.membership_epoch`,
                        syncSequence: sequence,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                    },
                });
        }
    }
    const activeUsers = await executor
        .select({
            id: users.id,
            username: users.username,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.kind, "human"),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
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
