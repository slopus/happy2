import { agentImageGet } from "../agent/agentImageGet.js";
import { agentImageList } from "../agent/agentImageList.js";
import { type DrizzleExecutor } from "../drizzle.js";
import {
    asSetupBaseImageDetails,
    asSetupBaseImageSummary,
    type SetupBaseImageDetails,
    type SetupBaseImageSummary,
} from "./impl/baseImagePresentation.js";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";
import { serverStepDb } from "./impl/serverStepDb.js";

/**
 * Returns the administrator-visible onboarding image catalog together with the selected image's complete durable build output.
 * Deriving source-specific build wording here lets refreshes reconstruct the same progress screen without process-local job state.
 */
export async function setupBaseImageGetStatus(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<{
    defaultImageId?: string;
    images: SetupBaseImageSummary[];
    selectedImage?: SetupBaseImageDetails;
    selectedImageId?: string;
}> {
    const catalog = await agentImageList(executor, actorUserId);
    const selectedStep = await serverStepDb(executor, "base_image_selected");
    const selectedImageId =
        selectedStep.state === "complete"
            ? baseImageSelectedId(selectedStep.metadataJson)
            : undefined;
    const selectedImage = selectedImageId
        ? await agentImageGet(executor, actorUserId, selectedImageId)
        : undefined;
    return {
        ...(catalog.defaultImageId ? { defaultImageId: catalog.defaultImageId } : {}),
        images: catalog.images.map(asSetupBaseImageSummary),
        ...(selectedImageId ? { selectedImageId } : {}),
        ...(selectedImage
            ? {
                  selectedImage: asSetupBaseImageDetails(selectedImage),
              }
            : {}),
    };
}
