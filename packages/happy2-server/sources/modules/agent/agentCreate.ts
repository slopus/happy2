import { type ChatSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import {
    agentImages,
    agentImageSettings,
    agentRigBindings,
    chatMembers,
    chats,
    users,
} from "../schema.js";

import { and, eq, sql } from "drizzle-orm";
import { chatHint } from "../chat/chatHint.js";

import { createId } from "@paralleldrive/cuid2";

import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatUpdateInsert } from "../chat/chatUpdateInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";

/**
 * Creates the agent users identity, its direct chat, initial membership, and agentRigBindings record for an active owner.
 * One transaction publishes a usable agent only when the identity and conversation substrate can be committed together.
 */
export async function agentCreate(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        agentEffort: string;
        actorUserId: string;
        containerName: string;
        imageId: string;
        name: string;
        username: string;
        sessionId: string;
        cwd: string;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        const [existing] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .where(sql`lower(${users.username}) = lower(${input.username})`)
            .limit(1);
        if (existing) throw new CollaborationError("conflict", "Agent username is already taken");
        const [configuredImage] = await tx
            .select({
                id: agentImages.id,
                status: agentImages.status,
                dockerImageId: agentImages.dockerImageId,
            })
            .from(agentImageSettings)
            .innerJoin(agentImages, eq(agentImages.id, agentImageSettings.defaultImageId))
            .where(and(eq(agentImageSettings.id, 1), eq(agentImages.id, input.imageId)))
            .limit(1);
        if (configuredImage?.status !== "ready" || !configuredImage.dockerImageId)
            throw new CollaborationError(
                "conflict",
                "A ready default agent image must be configured before creating agents",
            );
        const chatId = createId();
        const agentUserId = input.agentUserId;
        const sequence = await syncSequenceNext(tx);
        await tx.insert(users).values({
            id: agentUserId,
            accountId: null,
            createdByUserId: input.actorUserId,
            firstName: input.name,
            username: input.username,
            kind: "agent",
            agentImageId: input.imageId,
            agentEffort: input.agentEffort,
        });
        await tx.insert(chats).values({
            id: chatId,
            kind: "dm",
            dmType: "direct",
            createdByUserId: input.actorUserId,
            ownerUserId: input.actorUserId,
            dmKey: [input.actorUserId, agentUserId].sort().join(":"),
            visibility: "direct",
            isListed: 0,
            pts: 1,
            lastChangeSequence: sequence,
        });
        await tx.insert(agentRigBindings).values({
            userId: agentUserId,
            chatId,
            imageId: input.imageId,
            sessionId: input.sessionId,
            containerName: input.containerName,
            cwd: input.cwd,
            effort: input.agentEffort,
        });
        await tx.insert(chatMembers).values(
            [input.actorUserId, agentUserId].map((userId) => ({
                chatId,
                userId,
                role: userId === input.actorUserId ? ("owner" as const) : ("member" as const),
                membershipEpoch: createId(),
                syncSequence: sequence,
            })),
        );
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId,
            kind: "chat.created",
            entityId: chatId,
            actorUserId: input.actorUserId,
        });
        const chat = await chatGetAccess(tx, input.actorUserId, chatId, false);
        if (!chat) throw new Error("Created agent DM is not readable");
        return {
            chat,
            hint: chatHint(sequence, chatId, 1),
        };
    });
}
