import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { SetupError, type SetupSyncHint } from "./types.js";

import { completeRegistrationPolicyDb } from "./impl/completeRegistrationPolicyDb.js";
import { eq } from "drizzle-orm";
import { requireActiveAdministratorDb } from "./impl/requireActiveAdministratorDb.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { serverSetupState } from "../schema.js";
import { serverStepDb } from "./impl/serverStepDb.js";

/**
 * Finalizes registration_policy_selected and server_setup_complete after confirming the actor and every prerequisite.
 * Its retryable transaction updates the setup rows and emits both sync events together, making this the sole boundary that opens a newly configured server.
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
        return completeRegistrationPolicyDb(tx, actorUserId, registrationEnabled, {
            registrationEnabled,
        });
    });
}
