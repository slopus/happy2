import { type AgentImageSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentImageSelection } from "./impl/agentImageSelection.js";
import { agentImages } from "../schema.js";
import { areaHint } from "../chat/areaHint.js";
import { asAgentImage } from "./impl/asAgentImage.js";
import { createId } from "@paralleldrive/cuid2";
import { isUniqueConstraint } from "../chat/isUniqueConstraint.js";
import { sql } from "drizzle-orm";
import { text } from "../chat/text.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Creates a manageImages-authorized agentImages definition with validated build inputs and an initial lifecycle state.
 * Emitting its sync and audit records in the same transaction makes the new definition discoverable only as an authorized operation.
 */
export async function agentImageCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
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
        await userRequirePermission(tx, input.actorUserId, "manageImages");
        let created: Record<string, unknown>;
        try {
            [created] = await tx
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
        if (!created) throw new Error("Agent image was not created");
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_image.created",
            targetType: "agent_image",
            targetId: text(created.id),
            after: {
                definitionHash: input.definitionHash,
                name: input.name,
            },
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.created",
            entityId: text(created.id),
            actorUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "agent-images"),
            image: asAgentImage(created),
        };
    });
}
