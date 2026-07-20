import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { chatMembers, chats } from "../schema.js";
import { chatHint } from "./chatHint.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatUpdateInsert } from "./chatUpdateInsert.js";
import { isUniqueConstraint } from "./isUniqueConstraint.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { CollaborationError, type ChatSummary, type MutationHint } from "./types.js";

/**
 * Lets a channel manager create one private child beneath an active top-level channel, copying its current memberships, ownership, and default agent while selecting an independent agent model and message timeline.
 * The transaction publishes the chats row only after every inherited chatMembers row exists, which preserves parent-controlled access while giving the child its own durable timeline and future Rig session.
 */
export async function channelCreateChild(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        parentChatId: string;
        name: string;
        slug: string;
        topic?: string;
        agentModelId?: string;
    },
): Promise<{ chat: ChatSummary; hint: MutationHint; memberUserIds: string[] }> {
    return withTransaction(executor, async (tx) => {
        const parent = await chatRequireManager(tx, input.actorUserId, input.parentChatId);
        if (parent.kind === "dm" || parent.parentMessageId || parent.parentChatId)
            throw new CollaborationError(
                "invalid",
                "Child channels require a top-level parent channel",
            );
        if (parent.archivedAt)
            throw new CollaborationError(
                "invalid",
                "Child channels cannot be created under an archived channel",
            );
        if (!parent.ownerUserId || !parent.defaultAgentUserId)
            throw new Error("Parent channel ownership or default agent is missing");
        const memberships = await tx
            .select({
                userId: chatMembers.userId,
                role: chatMembers.role,
            })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, parent.id), isNull(chatMembers.leftAt)));
        if (memberships.length === 0) throw new Error("Parent channel has no active memberships");
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        try {
            await tx.insert(chats).values({
                id,
                kind: "private_channel",
                name: input.name,
                slug: input.slug,
                topic: input.topic,
                parentChatId: parent.id,
                createdByUserId: input.actorUserId,
                pts: 1,
                ownerUserId: parent.ownerUserId,
                visibility: "private",
                isListed: 0,
                defaultAgentUserId: parent.defaultAgentUserId,
                agentModelId: input.agentModelId,
                lastChangeSequence: sequence,
            });
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "Channel slug is already in use");
            throw error;
        }
        await tx.insert(chatMembers).values(
            memberships.map((membership) => ({
                chatId: id,
                userId: membership.userId,
                role: membership.role,
                membershipEpoch: createId(),
                syncSequence: sequence,
            })),
        );
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: id,
            kind: "chat.created",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        const chat = await chatRequireManager(tx, input.actorUserId, id);
        return {
            chat,
            hint: chatHint(sequence, id, 1),
            memberUserIds: memberships.map((membership) => membership.userId),
        };
    });
}
