import { type DrizzleExecutor } from "../../drizzle.js";
import { eq } from "drizzle-orm";
import { type ServerSetupStep, type ServerSetupStepState } from "../types.js";
import { serverSetupSteps } from "../../schema.js";

export async function serverStepDb(
    executor: DrizzleExecutor,
    step: ServerSetupStep,
): Promise<{
    state: ServerSetupStepState;
    startedAt: string | null;
    metadataJson: string | null;
    lastError: string | null;
}> {
    const [row] = await executor
        .select({
            state: serverSetupSteps.state,
            startedAt: serverSetupSteps.startedAt,
            metadataJson: serverSetupSteps.metadataJson,
            lastError: serverSetupSteps.lastError,
        })
        .from(serverSetupSteps)
        .where(eq(serverSetupSteps.step, step));
    if (!row) throw new Error(`Server setup step ${step} is not initialized`);
    return {
        state: row.state as ServerSetupStepState,
        startedAt: row.startedAt,
        metadataJson: row.metadataJson,
        lastError: row.lastError,
    };
}
