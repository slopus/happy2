import { type DrizzleTransaction } from "../../drizzle.js";
import { accounts, agentImages, chatMembers, chats, syncEvents, users } from "../../schema.js";
import { channelAdvance } from "../../chat/channelAdvance.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { channelUpdateInsert } from "../../chat/channelUpdateInsert.js";

import { syncSequenceNext } from "../../sync/syncSequenceNext.js";

import { userJoinAutoChannels } from "../../user/userJoinAutoChannels.js";
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
            .where(sql`lower(${users.username}) = 'happy'`);
        for (const conflict of conflicts) {
            let username: string;
            let occupied:
                | {
                      id: string;
                  }
                | undefined;
            do {
                username = `former-happy-${createId().slice(0, 10)}`;
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
            firstName: "Happy",
            username: "happy",
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
        };
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
            })
            .where(eq(chats.id, main.id));
    }
    const channels = await executor
        .select({
            id: chats.id,
        })
        .from(chats)
        .where(and(ne(chats.kind, "dm"), isNull(chats.deletedAt)));
    for (const channel of channels) {
        const [membership] = await executor
            .select({
                leftAt: chatMembers.leftAt,
            })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, happy.id)))
            .limit(1);
        if (membership?.leftAt === null) continue;
        const sequence = await syncSequenceNext(executor);
        await channelAdvance(executor, {
            sequence,
            chatId: channel.id,
            kind: "member.systemJoined",
            entityId: happy.id,
            actorUserId: happy.id,
        });
        await executor
            .insert(chatMembers)
            .values({
                chatId: channel.id,
                userId: happy.id,
                role: channel.id === main.id ? "owner" : "member",
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
    for (const user of activeUsers) await userJoinAutoChannels(executor, user, undefined, main.id);
}
