import { type AgentImageSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentImageSelection } from "./impl/agentImageSelection.js";
import { agentImages, agentImageSettings } from "../schema.js";

import { eq, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { asAgentImage } from "./impl/asAgentImage.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

/**
 * Selects a ready image in agentImageSettings as the server default after administrator authorization.
 * Coupling the setting with sync and audit records prevents clients from seeing an unexplained default-image change.
 */
export async function agentImageSetDefault(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        imageId: string;
    },
): Promise<{
    hint: MutationHint;
    image: AgentImageSummary;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        const [image] = await tx
            .select(agentImageSelection)
            .from(agentImages)
            .where(eq(agentImages.id, input.imageId))
            .limit(1);
        if (!image) throw new CollaborationError("not_found", "Agent image was not found");
        if (image.status !== "ready" || !image.docker_image_id)
            throw new CollaborationError("conflict", "Only a ready agent image can be the default");
        await tx
            .update(agentImageSettings)
            .set({
                defaultImageId: input.imageId,
                updatedByUserId: input.actorUserId,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(agentImageSettings.id, 1));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_image.default_selected",
            targetType: "agent_image",
            targetId: input.imageId,
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.defaultSelected",
            entityId: input.imageId,
            actorUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "agent-images"),
            image: asAgentImage(image),
        };
    });
}
