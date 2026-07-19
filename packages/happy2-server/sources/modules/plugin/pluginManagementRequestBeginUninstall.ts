import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { pluginManagementRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { PluginError } from "./types.js";

/** Claims one pending pluginManagementRequests uninstall by changing it to processing for a chat-member administrator. This durable state boundary serializes approval and returns the exact installation target for runtime removal. */
export async function pluginManagementRequestBeginUninstall(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; requestId: string },
): Promise<{ targetInstallationId: string; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, true)))
            throw new PluginError("forbidden", "Chat membership is required");
        const [row] = await tx
            .select({
                action: pluginManagementRequests.action,
                status: pluginManagementRequests.status,
                targetInstallationId: pluginManagementRequests.targetInstallationId,
            })
            .from(pluginManagementRequests)
            .where(
                and(
                    eq(pluginManagementRequests.id, input.requestId),
                    eq(pluginManagementRequests.chatId, input.chatId),
                ),
            )
            .limit(1);
        if (!row) throw new PluginError("not_found", "Plugin management request was not found");
        if (row.action !== "uninstall")
            throw new PluginError("conflict", "Request is not an uninstall");
        if (row.status !== "pending")
            throw new PluginError("conflict", `Plugin request is already ${row.status}`);
        if (!row.targetInstallationId) throw new Error("Plugin uninstall request has no target");
        const updated = await tx
            .update(pluginManagementRequests)
            .set({
                status: "processing",
                resolvedByUserId: input.actorUserId,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginManagementRequests.id, input.requestId),
                    eq(pluginManagementRequests.status, "pending"),
                ),
            )
            .returning({ id: pluginManagementRequests.id });
        if (updated.length !== 1)
            throw new PluginError("conflict", "Plugin request was already resolved");
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
            "plugin.uninstall_processing",
            input.requestId,
        );
        return {
            targetInstallationId: row.targetInstallationId,
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
