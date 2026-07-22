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
import { userRequireServerAdmin } from "./userRequireServerAdmin.js";
import { agentDefaultRequire } from "../agent/agentDefaultRequire.js";
import { projectDefaultRequire } from "../project/projectDefaultRequire.js";
import { projectRequire } from "../project/projectRequire.js";
import { projectDirectoryList } from "../project/projectDirectoryList.js";

/**
 * Creates one chats row in the selected visible project, with an administrative creator for public channels or an owner for private channels, plus the sole default agent.
 * A delegated steward may be credited and granted control while the initiating actor remains an administrator, letting capability-authorized provisioning preserve both product ownership and audit identity.
 */
export async function channelCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        stewardUserId?: string;
        projectId?: string;
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
        const stewardUserId = input.stewardUserId ?? input.actorUserId;
        if (stewardUserId !== input.actorUserId) await userRequireActive(tx, stewardUserId);
        if (input.autoJoin) await userRequireServerAdmin(tx, input.actorUserId);
        const project = input.projectId
            ? await projectRequire(tx, input.projectId)
            : await projectDefaultRequire(tx);
        if (
            input.projectId &&
            project.createdByUserId !== input.actorUserId &&
            !(await projectDirectoryList(tx, input.actorUserId)).some(
                (visible) => visible.id === project.id,
            )
        )
            throw new CollaborationError("not_found", "Project was not found");
        const defaultAgentUserId = await agentDefaultRequire(tx);
        const id = createId();
        const membershipEpoch = createId();
        const sequence = await syncSequenceNext(tx);
        try {
            await tx.insert(chats).values({
                id,
                kind: input.kind,
                projectId: project.id,
                name: input.name,
                slug: input.slug,
                topic: input.topic,
                createdByUserId: stewardUserId,
                pts: 1,
                ownerUserId: input.kind === "private_channel" ? stewardUserId : null,
                visibility: input.kind === "public_channel" ? "public" : "private",
                autoJoin: input.autoJoin ? 1 : 0,
                defaultAgentUserId,
                lastChangeSequence: sequence,
            });
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "Channel slug is already in use");
            throw error;
        }
        await tx.insert(chatMembers).values({
            chatId: id,
            userId: stewardUserId,
            role: input.kind === "private_channel" ? "owner" : "admin",
            membershipEpoch,
            syncSequence: sequence,
        });
        if (stewardUserId !== input.actorUserId)
            await tx.insert(chatMembers).values({
                chatId: id,
                userId: input.actorUserId,
                role: "admin",
                membershipEpoch: createId(),
                syncSequence: sequence,
            });
        await tx.insert(chatMembers).values({
            chatId: id,
            userId: defaultAgentUserId,
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
