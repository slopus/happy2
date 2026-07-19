import { type AgentImageSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentImageSelection } from "./impl/agentImageSelection.js";
import { agentImages } from "../schema.js";
import { areaHint } from "../chat/areaHint.js";
import { asAgentImage } from "./impl/asAgentImage.js";
import { createId } from "@paralleldrive/cuid2";
import { isUniqueConstraint } from "../chat/isUniqueConstraint.js";
import { and, eq, sql } from "drizzle-orm";
import { text } from "../chat/text.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Creates an agentImages definition, or reactivates the retained manifest for the same immutable definition, with validated build inputs and a fresh pending build while preserving its cumulative attempt count.
 * Emitting installation provenance, sync evidence, and audit evidence in the same transaction makes either lifecycle transition attributable before the service queues its build.
 */
export async function agentImageCreate(
    executor: DrizzleExecutor,
    input: {
        actorInstallationId?: string;
        actorUserId?: string;
        definitionHash: string;
        dockerTag: string;
        dockerfile: string;
        name: string;
    },
): Promise<{
    hint: MutationHint;
    image: AgentImageSummary;
}> {
    return withTransaction(executor, async (tx) => {
        if (input.actorUserId) await userRequirePermission(tx, input.actorUserId, "manageImages");
        else if (!input.actorInstallationId)
            throw new CollaborationError(
                "forbidden",
                "Agent image management authority is required",
            );
        const [existing] = await tx
            .select({
                id: agentImages.id,
                name: agentImages.name,
                builtinKey: agentImages.builtinKey,
                deletedAt: agentImages.deletedAt,
            })
            .from(agentImages)
            .where(eq(agentImages.definitionHash, input.definitionHash))
            .limit(1);
        let image: Record<string, unknown> | undefined;
        const reactivated = Boolean(existing?.deletedAt);
        if (existing) {
            if (!existing.deletedAt || existing.builtinKey)
                throw new CollaborationError(
                    "conflict",
                    "An agent image with this immutable definition already exists",
                );
            [image] = await tx
                .update(agentImages)
                .set({
                    name: input.name,
                    dockerfile: input.dockerfile,
                    dockerTag: input.dockerTag,
                    status: "pending",
                    buildProgress: 0,
                    buildLog: "",
                    buildLogTruncated: 0,
                    lastBuildLogLine: null,
                    buildLogUpdatedAt: null,
                    dockerImageId: null,
                    lastError: null,
                    buildRequestedAt: sql`CURRENT_TIMESTAMP`,
                    buildStartedAt: null,
                    readyAt: null,
                    workerId: null,
                    leaseExpiresAt: null,
                    deletedAt: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentImages.id, existing.id),
                        eq(agentImages.deletedAt, existing.deletedAt),
                    ),
                )
                .returning(agentImageSelection);
            if (!image)
                throw new CollaborationError("conflict", "Agent environment changed concurrently");
        } else {
            try {
                [image] = await tx
                    .insert(agentImages)
                    .values({
                        id: createId(),
                        name: input.name,
                        dockerfile: input.dockerfile,
                        definitionHash: input.definitionHash,
                        dockerTag: input.dockerTag,
                        status: "pending",
                        buildRequestedAt: sql`CURRENT_TIMESTAMP`,
                        createdByUserId: input.actorUserId,
                    })
                    .returning(agentImageSelection);
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError(
                        "conflict",
                        "An agent image with this immutable definition already exists",
                    );
                throw error;
            }
            if (!image) throw new Error("Agent image was not created");
        }
        if (!image) throw new Error("Agent image lifecycle transition did not return a record");
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: reactivated ? "agent_image.reactivated" : "agent_image.created",
            targetType: "agent_image",
            targetId: text(image.id),
            ...(reactivated && existing ? { before: { name: existing.name } } : {}),
            after: {
                actorInstallationId: input.actorInstallationId,
                definitionHash: input.definitionHash,
                name: input.name,
            },
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: reactivated ? "agentImage.reactivated" : "agentImage.created",
            entityId: text(image.id),
            actorUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "agent-images"),
            image: asAgentImage(image),
        };
    });
}
