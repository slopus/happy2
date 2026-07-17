import { and, eq, isNull } from "drizzle-orm";
import { type DrizzleExecutor } from "../../drizzle.js";

import { RegistrationClosedError } from "../errors.js";
import { serverSetupState, serverSetupSteps } from "../../schema.js";

/** Reserves the sole bootstrap account before setup, or enforces the administrator's final registration policy afterward. */
export async function authorizeNewRegistrationDb(
    executor: DrizzleExecutor,
    accountId: string,
): Promise<void> {
    const [setup] = await executor
        .select({
            bootstrapAccountId: serverSetupState.bootstrapAccountId,
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
    if (completion.state === "complete") {
        if (setup.registrationEnabled !== 1) throw new RegistrationClosedError();
        return;
    }
    if (setup.bootstrapAccountId) throw new RegistrationClosedError();
    const [reserved] = await executor
        .update(serverSetupState)
        .set({
            bootstrapAccountId: accountId,
            updatedAt: new Date().toISOString(),
        })
        .where(and(eq(serverSetupState.id, 1), isNull(serverSetupState.bootstrapAccountId)))
        .returning({
            id: serverSetupState.id,
        });
    if (!reserved) throw new RegistrationClosedError();
}
