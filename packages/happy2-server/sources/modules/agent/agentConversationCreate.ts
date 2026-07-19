import { type ChatSummary, CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages, chatMembers, chats, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import { chatUpdateInsert } from "../chat/chatUpdateInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";

/**
 * Creates a fresh direct conversation by inserting chats, chatMembers, and chatUpdates without a participant-pair key.
 * Every call commits a new chat identity so its lazy Rig binding, session, history, and retries remain independent.
 */
export async function agentConversationCreate(
    executor: DrizzleExecutor,
    input: { actorUserId: string; agentUserId: string },
): Promise<{ chat: ChatSummary; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        const [agent] = await tx
            .select({ id: users.id })
            .from(users)
            .innerJoin(agentImages, eq(agentImages.id, users.agentImageId))
            .where(
                and(
                    eq(users.id, input.agentUserId),
                    eq(users.kind, "agent"),
                    isNull(users.deletedAt),
                    eq(agentImages.status, "ready"),
                    isNull(agentImages.lastError),
                    isNull(agentImages.deletedAt),
                ),
            )
            .limit(1);
        if (!agent) throw new CollaborationError("not_found", "Executable agent was not found");
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        await tx.insert(chats).values({
            id,
            kind: "dm",
            dmType: "direct",
            dmKey: `agent-conversation:${id}`,
            createdByUserId: input.actorUserId,
            ownerUserId: input.actorUserId,
            visibility: "direct",
            isListed: 0,
            pts: 1,
            lastChangeSequence: sequence,
        });
        await tx.insert(chatMembers).values(
            [input.actorUserId, input.agentUserId].map((userId) => ({
                chatId: id,
                userId,
                role: userId === input.actorUserId ? ("owner" as const) : ("member" as const),
                membershipEpoch: createId(),
                syncSequence: sequence,
            })),
        );
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: id,
            kind: "chat.agentConversationCreated",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        const chat = await chatGetAccess(tx, input.actorUserId, id, true);
        if (!chat) throw new Error("Created agent conversation is not readable");
        return { chat, hint: chatHint(sequence, id, 1) };
    });
}
