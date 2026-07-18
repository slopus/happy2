import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { chatMembers, chats } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { chatUpdateInsert } from "../chat/chatUpdateInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { agentDefaultRequire } from "./agentDefaultRequire.js";

/**
 * Ensures one immutable pinned Happy DM by inserting chats, chatMembers, and chatUpdates while preserving separately created conversations.
 * The caller's transaction publishes the chat and both memberships together so sidebar loading never observes a half-created entry.
 */
export async function agentDefaultConversationEnsure(
    executor: DrizzleExecutor,
    input: { userId: string; sequence?: number },
): Promise<string> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.userId);
        const happyUserId = await agentDefaultRequire(tx);
        const [existing] = await tx
            .select({ id: chats.id })
            .from(chats)
            .where(
                and(
                    eq(chats.ownerUserId, input.userId),
                    eq(chats.isPinnedHappy, 1),
                    isNull(chats.deletedAt),
                ),
            )
            .limit(1);
        if (existing) return existing.id;
        const id = createId();
        const sequence = input.sequence ?? (await syncSequenceNext(tx));
        await tx.insert(chats).values({
            id,
            kind: "dm",
            dmType: "direct",
            dmKey: `happy:${id}`,
            createdByUserId: input.userId,
            ownerUserId: input.userId,
            visibility: "direct",
            isListed: 0,
            isPinnedHappy: 1,
            pts: 1,
            lastChangeSequence: sequence,
        });
        await tx.insert(chatMembers).values(
            [input.userId, happyUserId].map((userId) => ({
                chatId: id,
                userId,
                role: userId === input.userId ? ("owner" as const) : ("member" as const),
                membershipEpoch: createId(),
                syncSequence: sequence,
            })),
        );
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: id,
            kind: "chat.pinnedHappyCreated",
            entityId: id,
            actorUserId: input.userId,
        });
        return id;
    });
}
