import { type DrizzleExecutor } from "../../drizzle.js";
import {
    SERVER_SETUP_SCHEMA_VERSION,
    SERVER_SETUP_STEPS,
    type ServerSetupStepState,
    type SetupStepStatus,
} from "../types.js";

import { type ServerStepRecord } from "./serverStepRecord.js";

import { eq, inArray } from "drizzle-orm";

import { serverSetupState, serverSetupSteps } from "../../schema.js";

import { stepStatus } from "./stepStatus.js";
/** Reads and validates the complete durable server-onboarding snapshot for setup actions. */
export async function readServerSnapshot(executor: DrizzleExecutor): Promise<{
    schemaVersion: number;
    bootstrapAccountId: string | null;
    bootstrapAdminUserId: string | null;
    registrationEnabled: number | null;
    steps: ServerStepRecord;
}> {
    const [setup] = await executor
        .select({
            schemaVersion: serverSetupState.schemaVersion,
            bootstrapAccountId: serverSetupState.bootstrapAccountId,
            bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId,
            registrationEnabled: serverSetupState.registrationEnabled,
        })
        .from(serverSetupState)
        .where(eq(serverSetupState.id, 1));
    if (!setup) throw new Error("Server setup state is not initialized");
    if (setup.schemaVersion !== SERVER_SETUP_SCHEMA_VERSION)
        throw new Error(
            `Unsupported server setup schema version ${setup.schemaVersion}; expected ${SERVER_SETUP_SCHEMA_VERSION}`,
        );
    const rows = await executor
        .select()
        .from(serverSetupSteps)
        .where(inArray(serverSetupSteps.step, [...SERVER_SETUP_STEPS]));
    const byStep = new Map(rows.map((row) => [row.step, row]));
    const steps = {} as ServerStepRecord;
    for (const step of SERVER_SETUP_STEPS) {
        const row = byStep.get(step);
        if (!row) throw new Error(`Server setup step ${step} is not initialized`);
        steps[step] = stepStatus(row) as SetupStepStatus<ServerSetupStepState>;
    }
    return {
        ...setup,
        steps,
    };
}
