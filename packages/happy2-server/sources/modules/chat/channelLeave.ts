import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Marks the actor's chatMembers membership left and transfers chats ownership when the departing user owns the channel.
 * Keeping role repair and sync delivery in one transition prevents an ownerless channel or a client that still grants the leaver access.
 */
export async function channelLeave(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, actorUserId, chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "This chat's membership is fixed");
        if (access.isMain)
            throw new CollaborationError("invalid", "Members cannot leave the main channel");
        if (access.membershipRole === "owner") {
            const [otherOwner] = await tx
                .select({
                    userId: chatMembers.userId,
                })
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.chatId, chatId),
                        ne(chatMembers.userId, actorUserId),
                        isNull(chatMembers.leftAt),
                        eq(chatMembers.role, "owner"),
                    ),
                )
                .orderBy(chatMembers.joinedAt, chatMembers.userId)
                .limit(1);
            if (!otherOwner)
                throw new CollaborationError(
                    "conflict",
                    "Transfer channel ownership before leaving",
                );
            await tx
                .update(chats)
                .set({
                    ownerUserId: otherOwner.userId,
                })
                .where(and(eq(chats.id, chatId), eq(chats.ownerUserId, actorUserId)));
        }
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            actorUserId,
            chatId,
            "member.left",
            actorUserId,
            actorUserId,
        );
        await tx
            .update(chatMembers)
            .set({
                leftAt: sql`CURRENT_TIMESTAMP`,
                syncSequence: sequence,
            })
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    eq(chatMembers.userId, actorUserId),
                    isNull(chatMembers.leftAt),
                ),
            );
        return {
            hint: chatHint(sequence, chatId, mutation.pts),
        };
    });
}
