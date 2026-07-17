import { CollaborationError, type MessageSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, eq, isNull } from "drizzle-orm";
import { chats } from "../schema.js";

import { messageSend } from "./messageSend.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
/**
 * Sends an automated or bot-attributed message into an existing live chat after requiring a server administrator.
 * Routing through the normal message transaction preserves attachment validation, idempotency, search, mentions, delivery, and channel sequencing.
 */
export async function messageSendAutomated(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        text: string;
        attachmentFileIds?: string[];
        clientMutationId?: string;
        botId?: string;
    },
): Promise<{
    message: MessageSummary;
    hint: MutationHint;
}> {
    await userRequireServerAdmin(executor, input.actorUserId);
    const [chat] = await executor
        .select({
            id: chats.id,
        })
        .from(chats)
        .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
        .limit(1);
    if (!chat) throw new CollaborationError("not_found", "Chat was not found");
    return messageSend(executor, {
        actorUserId: input.actorUserId,
        chatId: input.chatId,
        text: input.text,
        attachmentFileIds: input.attachmentFileIds,
        clientMutationId: input.clientMutationId,
        kind: "automated",
        senderBotId: input.botId,
    });
}
