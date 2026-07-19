import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginManagementRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/** Finalizes a claimed pluginManagementRequests uninstall as approved or failed and advances the originating chats point in one transaction. This completion boundary records the runtime-removal outcome with audit and reactive card evidence. */
export async function pluginManagementRequestCompleteUninstall(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; requestId: string; error?: string },
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        const status = input.error ? "failed" : "approved";
        const updated = await tx
            .update(pluginManagementRequests)
            .set({
                status,
                lastError: input.error,
                resolvedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginManagementRequests.id, input.requestId),
                    eq(pluginManagementRequests.chatId, input.chatId),
                    eq(pluginManagementRequests.status, "processing"),
                ),
            )
            .returning({ id: pluginManagementRequests.id });
        if (updated.length !== 1) throw new Error("Claimed plugin uninstall request was not found");
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: input.error ? "plugin.uninstall_failed" : "plugin.uninstall_approved",
            targetType: "plugin_management_request",
            targetId: input.requestId,
            chatId: input.chatId,
            after: input.error ? { error: input.error } : undefined,
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
            input.error ? "plugin.uninstall_failed" : "plugin.uninstall_approved",
            input.requestId,
        );
        return chatHint(sequence, input.chatId, mutation.pts);
    });
}
