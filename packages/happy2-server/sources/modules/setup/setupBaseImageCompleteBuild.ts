import type { MutationHint } from "../chat/types.js";
import { agentImageCompleteBuild } from "../agent/agentImageCompleteBuild.js";
import { agentImageSetDefault } from "../agent/agentImageSetDefault.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSetupState, serverSetupSteps, syncEvents } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { eq } from "drizzle-orm";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";
import { baseImageSyncHint } from "./impl/baseImageSyncHint.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { serverStepDb } from "./impl/serverStepDb.js";

/**
 * Completes a leased agentImages build and atomically promotes a selected image through agentImageSettings while completing its serverSetupSteps row.
 * A promotion or setup invariant failure rolls back those rows, audit history, and syncEvents so the worker records one retryable failure without changing the previous default.
 */
export async function setupBaseImageCompleteBuild(
    executor: DrizzleExecutor,
    input: { dockerImageId: string; imageId: string; workerId: string },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const completed = await agentImageCompleteBuild(tx, input);
        if (!completed) return undefined;
        const [selectedStep, requestedStep, readyStep] = await Promise.all([
            serverStepDb(tx, "base_image_selected"),
            serverStepDb(tx, "base_image_build_requested"),
            serverStepDb(tx, "base_image_ready"),
        ]);
        if (
            selectedStep.state !== "complete" ||
            baseImageSelectedId(selectedStep.metadataJson) !== input.imageId
        )
            return completed;
        if (requestedStep.state !== "complete" || readyStep.state === "complete")
            throw new Error("Selected base image setup state cannot accept build completion");
        const [setup] = await tx
            .select({ bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId })
            .from(serverSetupState)
            .where(eq(serverSetupState.id, 1))
            .limit(1);
        if (!setup?.bootstrapAdminUserId)
            throw new Error("Base image promotion requires the bootstrap administrator");
        await agentImageSetDefault(tx, {
            actorUserId: setup.bootstrapAdminUserId,
            imageId: input.imageId,
        });
        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: encodedMetadata({
                    imageId: input.imageId,
                    dockerImageId: input.dockerImageId,
                    reused: false,
                }),
                lastError: null,
                startedAt: readyStep.startedAt ?? now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "base_image_ready"));
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind: "setup.baseImage.ready",
            entityId: input.imageId,
            actorUserId: setup.bootstrapAdminUserId,
        });
        return baseImageSyncHint(sequence);
    });
}
