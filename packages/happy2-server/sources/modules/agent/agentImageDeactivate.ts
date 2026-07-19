import { and, eq, isNull, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    agentImages,
    agentImageSettings,
    agentRigBindings,
    pluginInstallations,
    users,
} from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Tombstones an unused custom agentImages definition after human or installation-scoped management authorization.
 * One transaction rejects defaults, assignments, active builds, and plugin selections before retaining the immutable manifest with attributable audit and sync evidence.
 */
export async function agentImageDeactivate(
    executor: DrizzleExecutor,
    input: {
        actorInstallationId?: string;
        actorUserId?: string;
        imageId: string;
    },
): Promise<{ hint: MutationHint; imageId: string }> {
    return withTransaction(executor, async (tx) => {
        if (input.actorUserId) await userRequirePermission(tx, input.actorUserId, "manageImages");
        else if (!input.actorInstallationId)
            throw new CollaborationError(
                "forbidden",
                "Agent image management authority is required",
            );
        const [image] = await tx
            .select({
                id: agentImages.id,
                name: agentImages.name,
                builtinKey: agentImages.builtinKey,
                status: agentImages.status,
                deletedAt: agentImages.deletedAt,
            })
            .from(agentImages)
            .where(eq(agentImages.id, input.imageId))
            .limit(1);
        if (!image) throw new CollaborationError("not_found", "Agent environment was not found");
        if (image.deletedAt)
            throw new CollaborationError("conflict", "Agent environment is already deactivated");
        if (image.builtinKey)
            throw new CollaborationError(
                "conflict",
                "Built-in agent environments cannot be deactivated",
            );
        if (image.status === "pending" || image.status === "building")
            throw new CollaborationError(
                "conflict",
                "Agent environment cannot be deactivated while its image build is active or queued",
            );
        const [defaultUse, userUse, bindingUse, pluginUse] = await Promise.all([
            tx
                .select({ id: agentImageSettings.id })
                .from(agentImageSettings)
                .where(eq(agentImageSettings.defaultImageId, input.imageId))
                .limit(1)
                .then((rows) => rows[0]),
            tx
                .select({ id: users.id })
                .from(users)
                .where(eq(users.agentImageId, input.imageId))
                .limit(1)
                .then((rows) => rows[0]),
            tx
                .select({ id: agentRigBindings.userId })
                .from(agentRigBindings)
                .where(eq(agentRigBindings.imageId, input.imageId))
                .limit(1)
                .then((rows) => rows[0]),
            tx
                .select({ id: pluginInstallations.id })
                .from(pluginInstallations)
                .where(eq(pluginInstallations.containerImageId, input.imageId))
                .limit(1)
                .then((rows) => rows[0]),
        ]);
        if (defaultUse || userUse || bindingUse || pluginUse)
            throw new CollaborationError(
                "conflict",
                "Agent environment is in use and cannot be deactivated",
            );
        const deactivated = await tx
            .update(agentImages)
            .set({ deletedAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(and(eq(agentImages.id, input.imageId), isNull(agentImages.deletedAt)))
            .returning({ id: agentImages.id });
        if (deactivated.length !== 1)
            throw new CollaborationError("conflict", "Agent environment changed concurrently");
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_image.deactivated",
            targetType: "agent_image",
            targetId: input.imageId,
            before: { name: image.name },
            after: { actorInstallationId: input.actorInstallationId },
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.deactivated",
            entityId: input.imageId,
            actorUserId: input.actorUserId,
        });
        return { hint: areaHint(sequence, "agent-images"), imageId: input.imageId };
    });
}
