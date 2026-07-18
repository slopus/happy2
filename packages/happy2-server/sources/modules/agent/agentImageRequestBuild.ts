import { type AgentImageSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentImageSelection } from "./impl/agentImageSelection.js";
import { agentImages } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { asAgentImage } from "./impl/asAgentImage.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

/**
 * Queues an administrator-selected agentImages definition for a fresh build and resets its prior terminal output.
 * Recording the lifecycle transition with its audit and sync evidence gives workers and clients one authoritative build request.
 */
export async function agentImageRequestBuild(
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
        const [current] = await tx
            .select({
                status: agentImages.status,
            })
            .from(agentImages)
            .where(eq(agentImages.id, input.imageId))
            .limit(1);
        if (!current) throw new CollaborationError("not_found", "Agent image was not found");
        if (current.status === "ready")
            throw new CollaborationError("conflict", "Agent image is already ready");
        if (current.status === "building")
            throw new CollaborationError("conflict", "Agent image is already building");
        const [image] = await tx
            .update(agentImages)
            .set({
                status: "pending",
                buildProgress: 0,
                buildLog: "",
                buildLogTruncated: 0,
                lastBuildLogLine: null,
                buildLogUpdatedAt: null,
                buildRequestedAt: sql`CURRENT_TIMESTAMP`,
                buildStartedAt: null,
                dockerImageId: null,
                lastError: null,
                readyAt: null,
                workerId: null,
                leaseExpiresAt: null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(agentImages.id, input.imageId))
            .returning(agentImageSelection);
        if (!image) throw new Error("Agent image build was not requested");
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_image.build_requested",
            targetType: "agent_image",
            targetId: input.imageId,
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.buildRequested",
            entityId: input.imageId,
            actorUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "agent-images"),
            image: asAgentImage(image),
        };
    });
}
