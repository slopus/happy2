import type { MutationHint } from "../chat/types.js";
import { agentImageRequestBuild } from "../agent/agentImageRequestBuild.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages, serverSetupSteps, syncEvents } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { eq } from "drizzle-orm";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";
import { baseImageSyncHint } from "./impl/baseImageSyncHint.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { requireActiveAdministratorDb } from "./impl/requireActiveAdministratorDb.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { serverStepDb } from "./impl/serverStepDb.js";
import { SetupError } from "./types.js";

/**
 * Requeues only the failed agentImages record chosen during onboarding and returns its serverSetupSteps base_image_ready row to in-progress.
 * Updating the image request, setup row, audit, and syncEvents in one transaction keeps the immutable selection fixed and retry resumable.
 */
export async function setupBaseImageRetryBuild(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<{ hint: MutationHint; imageId: string }> {
    return withTransaction(executor, async (tx) => {
        await requireActiveAdministratorDb(tx, actorUserId);
        await requirePrerequisitesDb(tx, "base_image_ready");
        const [selectedStep, readyStep] = await Promise.all([
            serverStepDb(tx, "base_image_selected"),
            serverStepDb(tx, "base_image_ready"),
        ]);
        const imageId = baseImageSelectedId(selectedStep.metadataJson);
        if (selectedStep.state !== "complete" || !imageId)
            throw new SetupError("conflict", "A base image must be selected before retrying");
        const [image] = await tx
            .select({ status: agentImages.status })
            .from(agentImages)
            .where(eq(agentImages.id, imageId))
            .limit(1);
        if (!image) throw new SetupError("not_found", "Selected base image was not found");
        if (image.status !== "failed" || readyStep.state !== "failed")
            throw new SetupError("conflict", "Only a failed base image build can be retried");
        await agentImageRequestBuild(tx, { actorUserId, imageId });
        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: "in_progress",
                metadataJson: encodedMetadata({ imageId }),
                lastError: null,
                startedAt: readyStep.startedAt ?? now,
                completedAt: null,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "base_image_ready"));
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind: "setup.baseImage.buildRetried",
            entityId: imageId,
            actorUserId,
        });
        return { hint: baseImageSyncHint(sequence), imageId };
    });
}
