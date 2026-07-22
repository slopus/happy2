import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";
import { areaHint } from "./areaHint.js";
import { createChannelServiceMessageDb } from "./impl/createChannelServiceMessageDb.js";

/**
 * Marks the actor's durable chatMembers membership voluntarily inactive and transfers chats ownership when another active owner exists.
 * Preserving the row and clearing removal provenance keeps history readable and allows any departed member to rejoin with the same role.
 */
export async function channelLeave(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<{
    hint: MutationHint;
    documentsHint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, actorUserId, chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "This chat's membership is fixed");
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
            if (otherOwner) {
                await tx
                    .update(chats)
                    .set({
                        ownerUserId: otherOwner.userId,
                    })
                    .where(and(eq(chats.id, chatId), eq(chats.ownerUserId, actorUserId)));
            }
        }
        const sequence = await syncSequenceNext(tx);
        await chatAdvanceWithSequence(
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
                removedByUserId: null,
                syncSequence: sequence,
            })
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    eq(chatMembers.userId, actorUserId),
                    isNull(chatMembers.leftAt),
                ),
            );
        const documentsChanged = await chatDescendantMembershipSync(tx, {
            ancestorChatId: chatId,
            userId: actorUserId,
            actorUserId,
            sequence,
            kind: "left",
        });
        const service = await createChannelServiceMessageDb(tx, {
            sequence,
            chatId,
            userId: actorUserId,
            type: "user_left",
        });
        return {
            hint: chatHint(sequence, chatId, service.pts),
            ...(documentsChanged ? { documentsHint: areaHint(sequence, "documents") } : {}),
        };
    });
}
