import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { SetupError, type SetupSyncHint } from "./types.js";

import { completeRegistrationPolicyDb } from "./impl/completeRegistrationPolicyDb.js";
import { eq } from "drizzle-orm";
import { requireActiveAdministratorDb } from "./impl/requireActiveAdministratorDb.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { serverSetupState } from "../schema.js";
import { serverStepDb } from "./impl/serverStepDb.js";
import { agentImageGetReadyDefault } from "../agent/agentImageGetReadyDefault.js";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";

/**
 * Finalizes registration_policy_selected and server_setup_complete only when agentImageSettings still names the ready agentImages selection recorded by serverSetupSteps.
 * Its retryable transaction updates the setup rows and emits both syncEvents together, making this the sole boundary that opens a newly configured server.
 */
export async function setupChooseRegistrationPolicy(
    executor: DrizzleExecutor,
    actorUserId: string,
    registrationEnabled: boolean,
): Promise<SetupSyncHint | undefined> {
    return withTransaction(executor, async (tx) => {
        await requireActiveAdministratorDb(tx, actorUserId);
        await requirePrerequisitesDb(tx, "registration_policy_selected");
        const [setup] = await tx
            .select({
                registrationEnabled: serverSetupState.registrationEnabled,
            })
            .from(serverSetupState)
            .where(eq(serverSetupState.id, 1));
        const registration = await serverStepDb(tx, "registration_policy_selected");
        const completed = await serverStepDb(tx, "server_setup_complete");
        if (
            registration.state === "complete" &&
            completed.state === "complete" &&
            setup?.registrationEnabled === (registrationEnabled ? 1 : 0)
        )
            return undefined;
        if (registration.state === "complete" || completed.state === "complete")
            throw new SetupError(
                "conflict",
                "Registration policy was already selected during onboarding",
            );
        const [selectedImage, readyImage, readyDefault] = await Promise.all([
            serverStepDb(tx, "base_image_selected"),
            serverStepDb(tx, "base_image_ready"),
            agentImageGetReadyDefault(tx),
        ]);
        const selectedImageId = baseImageSelectedId(selectedImage.metadataJson);
        const readyImageId = baseImageSelectedId(readyImage.metadataJson);
        if (
            !selectedImageId ||
            readyImageId !== selectedImageId ||
            readyDefault?.id !== selectedImageId
        )
            throw new SetupError(
                "conflict",
                "The selected base image must be ready and promoted as the default before setup can finish",
            );
        return completeRegistrationPolicyDb(tx, actorUserId, registrationEnabled, {
            registrationEnabled,
        });
    });
}
