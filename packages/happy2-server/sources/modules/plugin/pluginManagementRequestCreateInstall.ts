import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginManagementRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { asPluginManagementRequest } from "./impl/asManagementRequest.js";
import { pluginManagementRequestSelection } from "./impl/managementRequestSelection.js";
import { PluginError, type PluginManagementRequestSummary } from "./types.js";

/** Creates one idempotent pluginManagementRequests install for an immutable staged package and advances the originating chats point in one transaction. This boundary binds audit and reactive approval evidence to the exact agent call before installation authority exists. */
export async function pluginManagementRequestCreateInstall(
    executor: DrizzleExecutor,
    input: {
        id: string;
        actorUserId: string;
        agentUserId: string;
        callId: string;
        chatId: string;
        requesterInstallationId: string;
        displayName: string;
        shortName: string;
        description: string;
        reason?: string;
        sourceKind: "archive" | "link";
        sourceReference: string;
        packageDigest: string;
        packageDirectory: string;
        installationId: string;
    },
): Promise<{ created: boolean; hint?: MutationHint; request: PluginManagementRequestSummary }> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access)
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
                    eq(pluginManagementRequests.action, "install"),
                ),
            )
            .limit(1);
        if (existing) return { created: false, request: asPluginManagementRequest(existing) };
        await tx.insert(pluginManagementRequests).values({
            id: input.id,
            action: "install",
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
            sourceKind: input.sourceKind,
            sourceReference: input.sourceReference,
            packageDigest: input.packageDigest,
            packageDirectory: input.packageDirectory,
            installationId: input.installationId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.install_requested",
            targetType: "plugin_management_request",
            targetId: input.id,
            chatId: input.chatId,
            after: {
                agentUserId: input.agentUserId,
                requesterInstallationId: input.requesterInstallationId,
                shortName: input.shortName,
                sourceKind: input.sourceKind,
                sourceReference: input.sourceReference,
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
            "plugin.install_requested",
            input.id,
        );
        const [created] = await tx
            .select(pluginManagementRequestSelection)
            .from(pluginManagementRequests)
            .where(eq(pluginManagementRequests.id, input.id))
            .limit(1);
        if (!created) throw new Error("Plugin management request projection was not found");
        return {
            created: true,
            hint: chatHint(sequence, input.chatId, mutation.pts),
            request: asPluginManagementRequest(created),
        };
    });
}
