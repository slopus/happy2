import { type DrizzleTransaction } from "../drizzle.js";
import { channelAdvance } from "../chat/channelAdvance.js";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { chatMembers, chats, messages } from "../schema.js";

import { createId } from "@paralleldrive/cuid2";

import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { agentDefaultRequire } from "../agent/agentDefaultRequire.js";

/**
 * Adds a user to eligible auto-join chats through chatMembers and emits the corresponding channel updates and service messages.
 * Requiring the profile or migration transaction keeps membership epochs, messages, and their shared sync sequence in one durable commit.
 */
export async function userJoinAutoChannels(
    executor: DrizzleTransaction,
    user: {
        id: string;
        username: string;
    },
    sequence?: number,
    onlyChatId?: string,
): Promise<string> {
    const defaultAgentUserId = await agentDefaultRequire(executor);
    const channels = await executor
        .select({
            id: chats.id,
            name: chats.name,
            slug: chats.slug,
        })
        .from(chats)
        .where(
            and(
                ...(onlyChatId ? [eq(chats.id, onlyChatId)] : []),
                eq(chats.autoJoin, 1),
                ne(chats.kind, "dm"),
                isNull(chats.deletedAt),
                isNull(chats.archivedAt),
            ),
        );
    for (const channel of channels) {
        const [membership] = await executor
            .select({
                leftAt: chatMembers.leftAt,
            })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, user.id)))
            .limit(1);
        if (membership?.leftAt === null) continue;
        sequence ??= await syncSequenceNext(executor);
        const membershipEpoch = createId();
        await executor
            .insert(chatMembers)
            .values({
                chatId: channel.id,
                userId: user.id,
                role: "member",
                membershipEpoch,
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: {
                    role: "member",
                    membershipEpoch,
                    syncSequence: sequence,
                    joinedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    leftAt: null,
                },
            });
        await channelAdvance(executor, {
            sequence,
            chatId: channel.id,
            kind: "member.autoJoined",
            entityId: user.id,
            actorUserId: defaultAgentUserId,
            targetUserId: user.id,
        });
        const messageId = createId();
        const messageMutation = await channelAdvance(executor, {
            sequence,
            chatId: channel.id,
            kind: "message.serviceCreated",
            entityId: messageId,
            actorUserId: defaultAgentUserId,
            incrementMessageSequence: true,
        });
        await executor.insert(messages).values({
            id: messageId,
            chatId: channel.id,
            sequence: messageMutation.messageSequence!,
            changePts: messageMutation.pts,
            senderUserId: defaultAgentUserId,
            kind: "automated",
            text: `@${user.username} joined #${channel.slug ?? channel.name ?? "channel"}`,
            contentJson: JSON.stringify({
                service: {
                    type: "user_added",
                    userId: user.id,
                },
            }),
            publishedAt: sql`CURRENT_TIMESTAMP`,
        });
    }
    return defaultAgentUserId;
}
