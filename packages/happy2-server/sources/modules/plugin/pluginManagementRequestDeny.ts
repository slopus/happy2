import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { pluginManagementRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { PluginError } from "./types.js";
import type { PluginManagementRequestAction } from "./types.js";

/** Denies one pending pluginManagementRequests row and advances the originating chats point for a chat-member administrator in one transaction. This resolution boundary keeps authorization, audit evidence, and the reactive card state consistent. */
export async function pluginManagementRequestDeny(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        requestId: string;
        action: PluginManagementRequestAction;
    },
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, true)))
            throw new PluginError("forbidden", "Chat membership is required");
        const updated = await tx
            .update(pluginManagementRequests)
            .set({
                status: "denied",
                resolvedByUserId: input.actorUserId,
                resolvedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginManagementRequests.id, input.requestId),
                    eq(pluginManagementRequests.chatId, input.chatId),
                    eq(pluginManagementRequests.action, input.action),
                    eq(pluginManagementRequests.status, "pending"),
                ),
            )
            .returning({
                id: pluginManagementRequests.id,
                action: pluginManagementRequests.action,
            });
        if (updated.length !== 1)
            throw new PluginError("conflict", `Plugin ${input.action} request is not pending`);
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: `plugin.${updated[0]!.action}_denied`,
            targetType: "plugin_management_request",
            targetId: input.requestId,
            chatId: input.chatId,
        });
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(pluginManagementRequests)
            .set({ syncSequence: sequence })
            .where(eq(pluginManagementRequests.id, input.requestId));
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            `plugin.${updated[0]!.action}_denied`,
            input.requestId,
        );
        return chatHint(sequence, input.chatId, mutation.pts);
    });
}
