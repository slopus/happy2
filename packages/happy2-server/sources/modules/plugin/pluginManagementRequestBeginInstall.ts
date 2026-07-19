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
import { PluginError, type PluginSource } from "./types.js";

export interface PluginManagementRequestInstallWork {
    id: string;
    chatId: string;
    installationId: string;
    packageDigest: string;
    packageDirectory: string;
    source: Extract<PluginSource, { kind: "archive" | "link" }>;
    hint: MutationHint;
}

/** Claims one pending pluginManagementRequests install by changing it to processing for an active chat-member administrator. This durable state boundary serializes approval before filesystem and runtime side effects begin. */
export async function pluginManagementRequestBeginInstall(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; requestId: string },
): Promise<PluginManagementRequestInstallWork> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, true)))
            throw new PluginError("forbidden", "Chat membership is required");
        const [row] = await tx
            .select({
                id: pluginManagementRequests.id,
                action: pluginManagementRequests.action,
                status: pluginManagementRequests.status,
                chatId: pluginManagementRequests.chatId,
                sourceKind: pluginManagementRequests.sourceKind,
                sourceReference: pluginManagementRequests.sourceReference,
                packageDigest: pluginManagementRequests.packageDigest,
                packageDirectory: pluginManagementRequests.packageDirectory,
                installationId: pluginManagementRequests.installationId,
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
        if (row.action !== "install")
            throw new PluginError("conflict", "Request is not an install");
        if (row.status !== "pending")
            throw new PluginError("conflict", `Plugin request is already ${row.status}`);
        if (
            (row.sourceKind !== "archive" && row.sourceKind !== "link") ||
            !row.sourceReference ||
            !row.packageDigest ||
            !row.packageDirectory ||
            !row.installationId
        )
            throw new Error("Plugin install request has incomplete package metadata");
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
            "plugin.install_processing",
            input.requestId,
        );
        return {
            id: row.id,
            chatId: row.chatId,
            installationId: row.installationId,
            packageDigest: row.packageDigest,
            packageDirectory: row.packageDirectory,
            source: { kind: row.sourceKind, reference: row.sourceReference },
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
