import { type DrizzleTransaction } from "../../drizzle.js";
import { accounts, agentImages, chatMembers, chats, syncEvents, users } from "../../schema.js";
import { channelAdvance } from "../../chat/channelAdvance.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { channelUpdateInsert } from "../../chat/channelUpdateInsert.js";

import { syncSequenceNext } from "../../sync/syncSequenceNext.js";

import { userJoinAutoChannels } from "../../user/userJoinAutoChannels.js";
import { agentDefaultConversationEnsure } from "../../agent/agentDefaultConversationEnsure.js";
/**
 * Ensures the required agentImages service identity, main chats record, chatMembers defaults, and syncEvents exist.
 * Server migration supplies one transaction so restart repair either establishes the complete Happy/main-channel substrate or rolls it back for the next attempt.
 */
export async function ensureChannelDefaults(executor: DrizzleTransaction): Promise<void> {
    let [serviceImage] = await executor
        .select({
            id: agentImages.id,
        })
        .from(agentImages)
        .where(eq(agentImages.systemOnly, 1))
        .limit(1);
    if (!serviceImage) {
        const id = createId();
        await executor.insert(agentImages).values({
            id,
            name: "Happy service agent",
            dockerfile: "# Happy (2) internal service agent; not an executable image.\n",
            definitionHash: "happy2:system-service-agent:v1",
            dockerTag: "happy2/system-service-agent:v1",
            status: "pending",
            systemOnly: 1,
        });
        serviceImage = {
            id,
        };
    }
    let [happy] = await executor
        .select({
            id: users.id,
            firstName: users.firstName,
            username: users.username,
        })
        .from(users)
        .where(and(eq(users.systemRole, "service"), isNull(users.deletedAt)))
        .limit(1);
    if (!happy) {
        const conflicts = await executor
            .select({
                id: users.id,
                deletedAt: users.deletedAt,
            })
            .from(users)
            .where(sql`lower(${users.username}) = 'happy-service'`);
        for (const conflict of conflicts) {
            let username: string;
            let occupied:
                | {
                      id: string;
                  }
                | undefined;
            do {
                username = `former-happy-service-${createId().slice(0, 10)}`;
                [occupied] = await executor
                    .select({
                        id: users.id,
                    })
                    .from(users)
                    .where(sql`lower(${users.username}) = lower(${username})`)
                    .limit(1);
            } while (occupied);
            const sequence = await syncSequenceNext(executor);
            await executor
                .update(users)
                .set({
                    username,
                    syncSequence: sequence,
                })
                .where(eq(users.id, conflict.id));
            if (!conflict.deletedAt)
                await executor.insert(syncEvents).values({
                    sequence,
                    kind: "user.updated",
                    entityId: conflict.id,
                    actorUserId: conflict.id,
                });
        }
        const id = createId();
        const sequence = await syncSequenceNext(executor);
        await executor.insert(users).values({
            id,
            accountId: null,
            kind: "agent",
            agentImageId: serviceImage.id,
            firstName: "Happy service",
            username: "happy-service",
            role: "member",
            systemRole: "service",
            syncSequence: sequence,
        });
        await executor.insert(syncEvents).values({
            sequence,
            kind: "user.created",
            entityId: id,
            actorUserId: id,
        });
        happy = {
            id,
            firstName: "Happy service",
            username: "happy-service",
        };
    } else if (happy.username !== "happy-service" || happy.firstName !== "Happy service") {
        const conflicts = await executor
            .select({ id: users.id })
            .from(users)
            .where(and(sql`lower(${users.username}) = 'happy-service'`, ne(users.id, happy.id)));
        for (const conflict of conflicts)
            await executor
                .update(users)
                .set({ username: `former-happy-service-${createId().slice(0, 10)}` })
                .where(eq(users.id, conflict.id));
        const sequence = await syncSequenceNext(executor);
        await executor
            .update(users)
            .set({
                firstName: "Happy service",
                username: "happy-service",
                syncSequence: sequence,
            })
            .where(eq(users.id, happy.id));
        await executor.insert(syncEvents).values({
            sequence,
            kind: "user.updated",
            entityId: happy.id,
            actorUserId: happy.id,
        });
        happy = { id: happy.id, firstName: "Happy service", username: "happy-service" };
    }
    let [happyAgent] = await executor
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.agentRole, "default"), isNull(users.deletedAt)))
        .limit(1);
    if (!happyAgent) {
        const conflicts = await executor
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = 'happy'`);
        for (const conflict of conflicts)
            await executor
                .update(users)
                .set({ username: `former-happy-${createId().slice(0, 10)}` })
                .where(eq(users.id, conflict.id));
        const id = createId();
        const sequence = await syncSequenceNext(executor);
        await executor.insert(users).values({
            id,
            accountId: null,
            kind: "agent",
            agentImageId: serviceImage.id,
            firstName: "Happy",
            username: "happy",
            role: "member",
            agentRole: "default",
            syncSequence: sequence,
        });
        await executor.insert(syncEvents).values({
            sequence,
            kind: "user.created",
            entityId: id,
            actorUserId: happy.id,
        });
        happyAgent = { id };
    }
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
                    defaultAgentUserId: happyAgent.id,
                    lastChangeSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(chats.id, welcome.id));
            await channelAdvance(executor, {
                sequence,
                chatId: welcome.id,
                kind: "chat.mainAssigned",
                entityId: welcome.id,
                actorUserId: happy.id,
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
                createdByUserId: happy.id,
                ownerUserId: happy.id,
                visibility: "public",
                isListed: 1,
                isMain: 1,
                autoJoin: 1,
                defaultAgentUserId: happyAgent.id,
                pts: 1,
                lastChangeSequence: sequence,
            });
            await executor.insert(chatMembers).values({
                chatId: id,
                userId: happy.id,
                role: "owner",
                membershipEpoch: createId(),
                syncSequence: sequence,
            });
            await executor.insert(chatMembers).values({
                chatId: id,
                userId: happyAgent.id,
                role: "member",
                membershipEpoch: createId(),
                syncSequence: sequence,
            });
            await channelUpdateInsert(executor, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.created",
                entityId: id,
                actorUserId: happy.id,
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
                defaultAgentUserId: sql`coalesce(${chats.defaultAgentUserId}, ${happyAgent.id})`,
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
        for (const participant of [
            { id: happy.id, kind: "member.systemJoined" },
            { id: happyAgent.id, kind: "member.defaultAgentJoined" },
        ]) {
            const [membership] = await executor
                .select({ leftAt: chatMembers.leftAt })
                .from(chatMembers)
                .where(
                    and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, participant.id)),
                )
                .limit(1);
            const needsAssignment =
                participant.id === happyAgent.id && channel.defaultAgentUserId === null;
            if (membership?.leftAt === null && !needsAssignment) continue;
            const sequence = await syncSequenceNext(executor);
            await channelAdvance(executor, {
                sequence,
                chatId: channel.id,
                kind: needsAssignment ? "chat.defaultAgentAssigned" : participant.kind,
                entityId: participant.id,
                actorUserId: happy.id,
            });
            if (needsAssignment)
                await executor
                    .update(chats)
                    .set({ defaultAgentUserId: happyAgent.id })
                    .where(and(eq(chats.id, channel.id), isNull(chats.defaultAgentUserId)));
            await executor
                .insert(chatMembers)
                .values({
                    chatId: channel.id,
                    userId: participant.id,
                    role:
                        participant.id === happy.id && channel.id === main.id ? "owner" : "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
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
        await userJoinAutoChannels(executor, user, undefined, main.id);
        await agentDefaultConversationEnsure(executor, { userId: user.id });
    }
}
