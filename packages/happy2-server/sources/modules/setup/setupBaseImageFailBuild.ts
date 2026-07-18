import type { MutationHint } from "../chat/types.js";
import { agentImageFailBuild } from "../agent/agentImageFailBuild.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSetupSteps, syncEvents } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { eq } from "drizzle-orm";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";
import { baseImageSyncHint } from "./impl/baseImageSyncHint.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { serverStepDb } from "./impl/serverStepDb.js";

/**
 * Records a leased agentImages failure and mirrors it into the serverSetupSteps base_image_ready row only for the durable onboarding selection.
 * Updating both rows and syncEvents in one transaction prevents setup from advertising progress after the underlying job becomes retryable.
 */
export async function setupBaseImageFailBuild(
    executor: DrizzleExecutor,
    input: { error: string; imageId: string; workerId: string },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const failed = await agentImageFailBuild(tx, input);
        if (!failed) return undefined;
        const [selectedStep, readyStep] = await Promise.all([
            serverStepDb(tx, "base_image_selected"),
            serverStepDb(tx, "base_image_ready"),
        ]);
        if (
            selectedStep.state !== "complete" ||
            baseImageSelectedId(selectedStep.metadataJson) !== input.imageId
        )
            return failed;
        if (readyStep.state === "complete")
            throw new Error("A completed base image setup cannot accept a build failure");
        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: "failed",
                metadataJson: encodedMetadata({ imageId: input.imageId }),
                lastError: input.error,
                startedAt: readyStep.startedAt ?? now,
                completedAt: null,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "base_image_ready"));
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind: "setup.baseImage.failed",
            entityId: input.imageId,
        });
        return baseImageSyncHint(sequence);
    });
}
