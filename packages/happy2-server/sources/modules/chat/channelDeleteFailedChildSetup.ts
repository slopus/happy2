import { and, eq, isNull, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentRigBindings, chatMembers, chats } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { CollaborationError, type MutationHint } from "./types.js";

/**
 * Compensates a failed plugin child-channel setup by soft-deleting its chats row only when it is the same actor's newly created, empty child.
 * It advances chatUpdates and removes child agentRigBindings so members reconcile the rollback without retaining a usable agent session; this supports admins without granting general deletion authority.
 */
export async function channelDeleteFailedChildSetup(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string },
): Promise<{ hint: MutationHint; memberUserIds: string[] }> {
    return withTransaction(executor, async (tx) => {
        const [child] = await tx
            .select({
                createdByUserId: chats.createdByUserId,
                lastMessageSequence: chats.lastMessageSequence,
                parentChatId: chats.parentChatId,
            })
            .from(chats)
            .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
            .limit(1);
        if (
            !child ||
            !child.parentChatId ||
            child.createdByUserId !== input.actorUserId ||
            child.lastMessageSequence !== 0
        )
            throw new CollaborationError(
                "conflict",
                "Failed child-channel setup can no longer be compensated",
            );
        const members = await tx
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, input.chatId), isNull(chatMembers.leftAt)));
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "chat.deleted",
            input.chatId,
        );
        await tx
            .update(chats)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                deletedByUserId: input.actorUserId,
                deleteReason: "Child channel initial message setup failed",
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, input.chatId));
        await tx.delete(agentRigBindings).where(eq(agentRigBindings.chatId, input.chatId));
        return {
            hint: {
                sequence: String(sequence),
                chats: [{ chatId: mutation.chatId, pts: String(mutation.pts) }],
                areas: [],
            },
            memberUserIds: [...new Set(members.map(({ userId }) => userId))],
        };
    });
}
