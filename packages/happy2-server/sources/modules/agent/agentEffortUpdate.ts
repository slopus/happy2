import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";

import { agentRigBindings, messages } from "../schema.js";
import { agentEffortContextDb } from "./impl/agentEffortContextDb.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Updates agentRigBindings.effort and appends the same chat's explanatory messages, sync history, and auditLogEntries record atomically.
 * Keeping the override on the binding preserves the agent profile effort as a default and prevents a selection in one chat from changing another chat's session.
 */
export async function agentEffortUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        effort: string;
    },
): Promise<{
    hint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const context = await agentEffortContextDb(
            tx,
            input.actorUserId,
            input.chatId,
            input.agentUserId,
        );
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("forbidden", "Effort cannot be changed in this chat");
        const currentEffort = context.effort ?? context.defaultEffort;
        if (currentEffort === input.effort) return {};

        const sequence = await syncSequenceNext(tx);
        const changed = await tx
            .update(agentRigBindings)
            .set({
                effort: input.effort,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentRigBindings.userId, input.agentUserId),
                    eq(agentRigBindings.chatId, input.chatId),
                    eq(agentRigBindings.sessionId, context.sessionId),
                    context.effort
                        ? eq(agentRigBindings.effort, context.effort)
                        : isNull(agentRigBindings.effort),
                ),
            )
            .returning({ sessionId: agentRigBindings.sessionId });
        if (changed.length !== 1) throw new Error("Agent chat effort binding changed concurrently");

        const messageId = createId();
        const messageMutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "message.serviceCreated",
            messageId,
            undefined,
            true,
        );
        if (messageMutation.messageSequence === undefined)
            throw new Error("Service message sequence was not allocated");
        await tx.insert(messages).values({
            id: messageId,
            chatId: input.chatId,
            sequence: messageMutation.messageSequence,
            changePts: messageMutation.pts,
            senderUserId: input.actorUserId,
            kind: "automated",
            text: `@${context.agentUsername}'s reasoning effort changed to ${input.effort}`,
            contentJson: JSON.stringify({
                service: {
                    type: "agent_effort_changed",
                    agentUserId: input.agentUserId,
                    effort: input.effort,
                },
            }),
            publishedAt: sql`CURRENT_TIMESTAMP`,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent.chat_effort_changed",
            targetType: "user",
            targetId: input.agentUserId,
            chatId: input.chatId,
            before: {
                effort: currentEffort,
            },
            after: {
                effort: input.effort,
            },
        });
        return {
            hint: {
                sequence: String(sequence),
                chats: [
                    {
                        chatId: input.chatId,
                        pts: String(messageMutation.pts),
                    },
                ],
                areas: [],
            },
        };
    });
}
