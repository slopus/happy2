import type { AgentImageSummary, MutationHint } from "../chat/types.js";
import { agentImageCreate } from "../agent/agentImageCreate.js";
import { agentImageFindDefinition } from "../agent/agentImageFindDefinition.js";
import { agentImageRequestBuild } from "../agent/agentImageRequestBuild.js";
import { agentImageSetDefault } from "../agent/agentImageSetDefault.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSetupSteps, syncEvents } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { eq } from "drizzle-orm";
import { baseImagePresentation } from "./impl/baseImagePresentation.js";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";
import { baseImageSyncHint } from "./impl/baseImageSyncHint.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { requireActiveAdministratorDb } from "./impl/requireActiveAdministratorDb.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { serverStepDb } from "./impl/serverStepDb.js";
import { SetupError } from "./types.js";

export type SetupBaseImageSelection =
    | { builtinKey: "daycare-full" | "daycare-minimal"; kind: "builtin" }
    | {
          definitionHash: string;
          dockerTag: string;
          dockerfile: string;
          kind: "custom";
          name: string;
      };

/**
 * Selects one immutable agentImages definition, advances all three serverSetupSteps, and requests a build or promotes a ready image through agentImageSettings.
 * The setup rows, image request, default setting, audit, and syncEvents evidence share one transaction so partial selection is impossible.
 */
export async function setupBaseImageSelect(
    executor: DrizzleExecutor,
    actorUserId: string,
    selection: SetupBaseImageSelection,
): Promise<{ hint?: MutationHint; imageId: string; queueBuild: boolean }> {
    return withTransaction(executor, async (tx) => {
        await requireActiveAdministratorDb(tx, actorUserId);
        await requirePrerequisitesDb(tx, "base_image_selected");
        const [selectedStep, requestedStep, readyStep] = await Promise.all([
            serverStepDb(tx, "base_image_selected"),
            serverStepDb(tx, "base_image_build_requested"),
            serverStepDb(tx, "base_image_ready"),
        ]);
        const image = await resolveImage(tx, actorUserId, selection);
        const existingImageId =
            selectedStep.state === "complete"
                ? baseImageSelectedId(selectedStep.metadataJson)
                : undefined;
        if (selectedStep.state === "complete") {
            if (existingImageId === image.id)
                return {
                    imageId: image.id,
                    queueBuild: image.status === "pending" && Boolean(image.buildRequestedAt),
                };
            throw new SetupError("conflict", "A base image was already selected");
        }
        if (requestedStep.state !== "pending" || readyStep.state !== "pending")
            throw new SetupError("conflict", "Base image setup state is inconsistent");

        let current = image;
        if (
            current.status === "failed" ||
            (current.status === "pending" && !current.buildRequestedAt)
        )
            current = (await agentImageRequestBuild(tx, { actorUserId, imageId: current.id }))
                .image;
        const presentation = baseImagePresentation(current);
        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: encodedMetadata({
                    imageId: current.id,
                    source: presentation.source,
                    buildMode: presentation.buildMode,
                }),
                lastError: null,
                startedAt: selectedStep.startedAt ?? now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "base_image_selected"));
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: encodedMetadata({
                    imageId: current.id,
                    buildMode: presentation.buildMode,
                    reused: current.status === "ready",
                }),
                lastError: null,
                startedAt: requestedStep.startedAt ?? now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "base_image_build_requested"));

        if (current.status === "ready" && current.dockerImageId) {
            await agentImageSetDefault(tx, { actorUserId, imageId: current.id });
            await tx
                .update(serverSetupSteps)
                .set({
                    state: "complete",
                    metadataJson: encodedMetadata({
                        imageId: current.id,
                        dockerImageId: current.dockerImageId,
                        reused: true,
                    }),
                    lastError: null,
                    startedAt: readyStep.startedAt ?? now,
                    completedAt: now,
                    updatedAt: now,
                })
                .where(eq(serverSetupSteps.step, "base_image_ready"));
        } else {
            await tx
                .update(serverSetupSteps)
                .set({
                    state: "in_progress",
                    metadataJson: encodedMetadata({ imageId: current.id }),
                    lastError: null,
                    startedAt: readyStep.startedAt ?? now,
                    completedAt: null,
                    updatedAt: now,
                })
                .where(eq(serverSetupSteps.step, "base_image_ready"));
        }
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind:
                current.status === "ready"
                    ? "setup.baseImage.reused"
                    : "setup.baseImage.buildRequested",
            entityId: current.id,
            actorUserId,
        });
        return {
            hint: baseImageSyncHint(sequence),
            imageId: current.id,
            queueBuild: current.status === "pending" && Boolean(current.buildRequestedAt),
        };
    });
}

async function resolveImage(
    executor: DrizzleExecutor,
    actorUserId: string,
    selection: SetupBaseImageSelection,
): Promise<AgentImageSummary> {
    const existing = await agentImageFindDefinition(
        executor,
        selection.kind === "builtin"
            ? { builtinKey: selection.builtinKey }
            : { definitionHash: selection.definitionHash },
    );
    if (existing) return existing;
    if (selection.kind === "builtin")
        throw new SetupError("not_found", "Built-in base image was not found");
    return (
        await agentImageCreate(executor, {
            actorUserId,
            definitionHash: selection.definitionHash,
            dockerTag: selection.dockerTag,
            dockerfile: selection.dockerfile,
            name: selection.name,
        })
    ).image;
}
