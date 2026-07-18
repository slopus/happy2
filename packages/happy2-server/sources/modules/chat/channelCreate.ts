import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { createId } from "@paralleldrive/cuid2";
import { isUniqueConstraint } from "./isUniqueConstraint.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { chatUpdateInsert } from "./chatUpdateInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "./userRequireActive.js";
import { requireHappyServiceAgentDb } from "./impl/requireHappyServiceAgentDb.js";
import { userRequireServerAdmin } from "./userRequireServerAdmin.js";
import { agentDefaultRequire } from "../agent/agentDefaultRequire.js";

/**
 * Creates a chats channel with its owner membership and required Happy service participant after validating the creator and channel policy.
 * The transaction exposes a channel only after chatMembers and initial sync history are complete, so no client can discover an unusable room.
 */
export async function channelCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        kind: "public_channel" | "private_channel";
        name: string;
        slug: string;
        topic?: string;
        autoJoin?: boolean;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        if (input.autoJoin) await userRequireServerAdmin(tx, input.actorUserId);
        const happyUserId = await requireHappyServiceAgentDb(tx);
        const happyAgentUserId = await agentDefaultRequire(tx);
        const id = createId();
        const membershipEpoch = createId();
        const sequence = await syncSequenceNext(tx);
        try {
            await tx.insert(chats).values({
                id,
                kind: input.kind,
                name: input.name,
                slug: input.slug,
                topic: input.topic,
                createdByUserId: input.actorUserId,
                pts: 1,
                ownerUserId: input.actorUserId,
                visibility: input.kind === "public_channel" ? "public" : "private",
                autoJoin: input.autoJoin ? 1 : 0,
                defaultAgentUserId: happyAgentUserId,
                lastChangeSequence: sequence,
            });
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "Channel slug is already in use");
            throw error;
        }
        await tx.insert(chatMembers).values({
            chatId: id,
            userId: input.actorUserId,
            role: "owner",
            membershipEpoch,
            syncSequence: sequence,
        });
        await tx.insert(chatMembers).values({
            chatId: id,
            userId: happyAgentUserId,
            role: "member",
            membershipEpoch: createId(),
            syncSequence: sequence,
        });
        await tx.insert(chatMembers).values({
            chatId: id,
            userId: happyUserId,
            role: "member",
            membershipEpoch: createId(),
            syncSequence: sequence,
        });
        await chatUpdateInsert(tx, {
            sequence,
            pts: 1,
            chatId: id,
            kind: "chat.created",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        const chat = await chatGetAccess(tx, input.actorUserId, id, false);
        if (!chat) throw new Error("Created channel is not readable");
        return {
            chat,
            hint: chatHint(sequence, id, 1),
        };
    });
}
