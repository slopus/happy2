import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginManagementRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { asPluginManagementRequest } from "./impl/asManagementRequest.js";
import { pluginManagementRequestSelection } from "./impl/managementRequestSelection.js";
import { PluginError, type PluginManagementRequestSummary, type PluginSource } from "./types.js";

/** Creates one idempotent pluginManagementRequests uninstall with a validated metadata snapshot and advances the originating chats point in one transaction. This boundary binds human review and audit evidence to the exact agent call and installation target. */
export async function pluginManagementRequestCreateUninstall(
    executor: DrizzleExecutor,
    input: {
        id: string;
        actorUserId: string;
        agentUserId: string;
        callId: string;
        chatId: string;
        requesterInstallationId: string;
        targetInstallationId: string;
        displayName: string;
        shortName: string;
        description: string;
        reason?: string;
        source: PluginSource;
        packageDigest: string;
        packageDirectory: string;
    },
): Promise<{ created: boolean; hint?: MutationHint; request: PluginManagementRequestSummary }> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, true)))
            throw new PluginError("forbidden", "The originating user cannot access this chat");
        const [existing] = await tx
            .select(pluginManagementRequestSelection)
            .from(pluginManagementRequests)
            .where(
                and(
                    eq(
                        pluginManagementRequests.requesterInstallationId,
                        input.requesterInstallationId,
                    ),
                    eq(pluginManagementRequests.callId, input.callId),
                    eq(pluginManagementRequests.action, "uninstall"),
                ),
            )
            .limit(1);
        if (existing) return { created: false, request: asPluginManagementRequest(existing) };
        await tx.insert(pluginManagementRequests).values({
            id: input.id,
            action: "uninstall",
            status: "pending",
            chatId: input.chatId,
            actorUserId: input.actorUserId,
            agentUserId: input.agentUserId,
            requesterInstallationId: input.requesterInstallationId,
            callId: input.callId,
            displayName: input.displayName,
            shortName: input.shortName,
            description: input.description,
            reason: input.reason,
            sourceKind: input.source.kind,
            sourceReference: input.source.reference,
            packageDigest: input.packageDigest,
            packageDirectory: input.packageDirectory,
            targetInstallationId: input.targetInstallationId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.uninstall_requested",
            targetType: "plugin_management_request",
            targetId: input.id,
            chatId: input.chatId,
            after: {
                agentUserId: input.agentUserId,
                requesterInstallationId: input.requesterInstallationId,
                targetInstallationId: input.targetInstallationId,
                shortName: input.shortName,
            },
        });
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(pluginManagementRequests)
            .set({ syncSequence: sequence })
            .where(eq(pluginManagementRequests.id, input.id));
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "plugin.uninstall_requested",
            input.id,
        );
        const [created] = await tx
            .select(pluginManagementRequestSelection)
            .from(pluginManagementRequests)
            .where(eq(pluginManagementRequests.id, input.id))
            .limit(1);
        if (!created) throw new Error("Plugin uninstall request projection was not found");
        return {
            created: true,
            hint: chatHint(sequence, input.chatId, mutation.pts),
            request: asPluginManagementRequest(created),
        };
    });
}
