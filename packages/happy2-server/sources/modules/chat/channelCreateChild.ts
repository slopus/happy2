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
import { childMemberRequireParent } from "./impl/childMemberRequireParent.js";

/**
 * Inserts one chats child beneath an actively joined parent manager, inheriting visibility while keeping ownership, membership, model, and history independent.
 * Its initial chatMembers rows make the creator a private owner, retain the parent's active default agent, and require every other eligible parent member to join explicitly.
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
): Promise<{ chat: ChatSummary; hint: MutationHint; notifiedUserIds: string[] }> {
    return withTransaction(executor, async (tx) => {
        const parent = await chatRequireManager(tx, input.actorUserId, input.parentChatId);
        if (parent.kind === "dm" || parent.parentChatId)
            throw new CollaborationError(
                "invalid",
                "Child channels require a top-level parent channel",
            );
        if (parent.archivedAt)
            throw new CollaborationError(
                "invalid",
                "Child channels cannot be created under an archived channel",
            );
        await childMemberRequireParent(tx, parent.id, input.actorUserId);
        if (!parent.projectId) throw new Error("Parent channel project is missing");
        if (!parent.defaultAgentUserId) throw new Error("Parent channel default agent is missing");
        if (parent.kind === "private_channel" && !parent.ownerUserId)
            throw new Error("Private parent channel ownership is missing");
        const parentMemberships = await tx
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, parent.id), isNull(chatMembers.leftAt)));
        if (!parentMemberships.some(({ userId }) => userId === parent.defaultAgentUserId))
            throw new Error("Parent channel default agent membership is missing");
        const initialMemberships = new Map<string, "owner" | "admin" | "member">();
        initialMemberships.set(
            input.actorUserId,
            parent.kind === "private_channel" ? "owner" : "admin",
        );
        if (!initialMemberships.has(parent.defaultAgentUserId))
            initialMemberships.set(parent.defaultAgentUserId, "member");
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        try {
            await tx.insert(chats).values({
                id,
                projectId: parent.projectId,
                kind: parent.kind,
                name: input.name,
                slug: input.slug,
                topic: input.topic,
                parentChatId: parent.id,
                createdByUserId: input.actorUserId,
                pts: 1,
                ownerUserId: parent.kind === "private_channel" ? input.actorUserId : null,
                visibility: parent.kind === "public_channel" ? "public" : "private",
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
            [...initialMemberships].map(([userId, role]) => ({
                chatId: id,
                userId,
                role,
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
            notifiedUserIds: [
                ...new Set([
                    ...parentMemberships.map(({ userId }) => userId),
                    ...initialMemberships.keys(),
                ]),
            ],
        };
    });
}
