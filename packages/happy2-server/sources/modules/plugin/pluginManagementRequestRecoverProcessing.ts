import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginInstallations, pluginManagementRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/** Resolves pluginManagementRequests left processing by a stopped complete-server process according to the durable installation outcome. This restart boundary prevents approval cards from remaining permanently claimed while preserving audit and reactive chat evidence for the recovered terminal state. */
export async function pluginManagementRequestRecoverProcessing(
    executor: DrizzleExecutor,
): Promise<MutationHint[]> {
    return withTransaction(executor, async (tx) => {
        const rows = await tx
            .select({
                id: pluginManagementRequests.id,
                action: pluginManagementRequests.action,
                chatId: pluginManagementRequests.chatId,
                installationId: pluginManagementRequests.installationId,
                targetInstallationId: pluginManagementRequests.targetInstallationId,
                resolvedByUserId: pluginManagementRequests.resolvedByUserId,
            })
            .from(pluginManagementRequests)
            .where(eq(pluginManagementRequests.status, "processing"));
        const hints: MutationHint[] = [];
        for (const row of rows) {
            if (row.action !== "install" && row.action !== "uninstall")
                throw new Error(`Unknown processing plugin request action ${row.action}`);
            const durableId =
                row.action === "install" ? row.installationId : row.targetInstallationId;
            const [installation] = durableId
                ? await tx
                      .select({ id: pluginInstallations.id })
                      .from(pluginInstallations)
                      .where(eq(pluginInstallations.id, durableId))
                      .limit(1)
                : [];
            const approved =
                row.action === "install"
                    ? Boolean(row.installationId && installation)
                    : row.action === "uninstall"
                      ? Boolean(row.targetInstallationId && !installation)
                      : false;
            const error = approved
                ? undefined
                : "The server stopped before the plugin operation completed.";
            const updated = await tx
                .update(pluginManagementRequests)
                .set({
                    status: approved ? "approved" : "failed",
                    lastError: error,
                    resolvedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(pluginManagementRequests.id, row.id),
                        eq(pluginManagementRequests.status, "processing"),
                    ),
                )
                .returning({ id: pluginManagementRequests.id });
            if (updated.length !== 1)
                throw new Error("Processing plugin management request disappeared during recovery");
            const action = `plugin.${row.action}_${approved ? "approved" : "failed"}`;
            if (row.resolvedByUserId)
                await chatAppendAudit(tx, {
                    actorUserId: row.resolvedByUserId,
                    action,
                    targetType: "plugin_management_request",
                    targetId: row.id,
                    chatId: row.chatId,
                    after: { recoveredAfterRestart: true, ...(error ? { error } : {}) },
                });
            const sequence = await syncSequenceNext(tx);
            await tx
                .update(pluginManagementRequests)
                .set({ syncSequence: sequence })
                .where(eq(pluginManagementRequests.id, row.id));
            const mutation = await chatAdvanceWithSequence(
                tx,
                sequence,
                row.resolvedByUserId ?? undefined,
                row.chatId,
                action,
                row.id,
            );
            hints.push(chatHint(sequence, row.chatId, mutation.pts));
        }
        return hints;
    });
}
