import { type DrizzleExecutor } from "../../drizzle.js";
import { eq } from "drizzle-orm";
import { RegistrationClosedError } from "../errors.js";
import { serverSetupState, serverSetupSteps } from "../../schema.js";

/** Checks the completed-server policy or that both account and administrator bootstrap owner slots remain unclaimed without reserving them. */
export async function requireNewRegistrationRequestAllowedDb(
    executor: DrizzleExecutor,
): Promise<void> {
    const [setup] = await executor
        .select({
            bootstrapAccountId: serverSetupState.bootstrapAccountId,
            bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId,
            registrationEnabled: serverSetupState.registrationEnabled,
        })
        .from(serverSetupState)
        .where(eq(serverSetupState.id, 1));
    const [completion] = await executor
        .select({
            state: serverSetupSteps.state,
        })
        .from(serverSetupSteps)
        .where(eq(serverSetupSteps.step, "server_setup_complete"));
    if (!setup || !completion) throw new Error("Server setup state is not initialized");
    const allowed =
        completion.state === "complete"
            ? setup.registrationEnabled === 1
            : setup.bootstrapAccountId === null && setup.bootstrapAdminUserId === null;
    if (!allowed) throw new RegistrationClosedError();
}
