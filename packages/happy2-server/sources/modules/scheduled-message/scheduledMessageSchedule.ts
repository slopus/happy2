import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { type ScheduledMessageSummary } from "./impl/scheduledMessageSummary.js";
import { and, eq } from "drizzle-orm";
import { areaHint } from "./areaHint.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { createId } from "@paralleldrive/cuid2";

import { fileCanAccess } from "../file/fileCanAccess.js";
import { scheduledMessageAttachments, scheduledMessages } from "../schema.js";

import { getScheduledMessageWith } from "./impl/getScheduledMessageWith.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Creates scheduledMessages content and its authorized scheduledMessageAttachments for a future delivery time in an accessible chat.
 * Persisting the frozen payload, file grants, and sync hint together gives the later publisher a complete, permission-checked unit of work.
 */
export async function scheduledMessageSchedule(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        text: string;
        attachmentFileIds: string[];
        scheduledFor: string;
        timezone?: string;
        quotedMessageId?: string;
        threadRootMessageId?: string;
        clientMutationId?: string;
    },
): Promise<{
    message: ScheduledMessageSummary;
    hint?: MutationHint;
}> {
    if (!(await chatCanPost(executor, input.actorUserId, input.chatId)))
        throw new CollaborationError("not_found", "Chat was not found");
    for (const fileId of input.attachmentFileIds)
        if (!(await fileCanAccess(executor, input.actorUserId, fileId)))
            throw new CollaborationError("not_found", "Attachment file was not found");
    return withTransaction(executor, async (tx) => {
        const id = createId();
        try {
            await tx.insert(scheduledMessages).values({
                id,
                chatId: input.chatId,
                createdByUserId: input.actorUserId,
                text: input.text,
                quotedMessageId: input.quotedMessageId ?? null,
                threadRootMessageId: input.threadRootMessageId ?? null,
                scheduledFor: input.scheduledFor,
                timezone: input.timezone ?? null,
                clientMutationId: input.clientMutationId ?? null,
            });
        } catch (error) {
            if (!input.clientMutationId) throw error;
            const [existing] = await tx
                .select({
                    id: scheduledMessages.id,
                })
                .from(scheduledMessages)
                .where(
                    and(
                        eq(scheduledMessages.createdByUserId, input.actorUserId),
                        eq(scheduledMessages.clientMutationId, input.clientMutationId),
                    ),
                );
            if (!existing) throw error;
            return {
                message: await getScheduledMessageWith(tx, input.actorUserId, existing.id),
            };
        }
        if (input.attachmentFileIds.length > 0)
            await tx.insert(scheduledMessageAttachments).values(
                input.attachmentFileIds.map((fileId, position) => ({
                    scheduledMessageId: id,
                    fileId,
                    position,
                })),
            );
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "scheduled.created",
            entityId: id,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return {
            message: await getScheduledMessageWith(tx, input.actorUserId, id),
            hint: areaHint(sequence, "scheduled-messages"),
        };
    });
}
