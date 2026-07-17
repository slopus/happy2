import { type DrizzleExecutor } from "../../drizzle.js";
import { inArray } from "drizzle-orm";
import { type ServerSetupStep, SetupError } from "../types.js";
import { serverSetupSteps } from "../../schema.js";

import { STEP_PREREQUISITES } from "./stepPrerequisites.js";
export async function requirePrerequisitesDb(
    executor: DrizzleExecutor,
    step: ServerSetupStep,
): Promise<void> {
    const prerequisites = STEP_PREREQUISITES[step];
    if (prerequisites.length === 0) return;
    const rows = await executor
        .select({
            step: serverSetupSteps.step,
            state: serverSetupSteps.state,
        })
        .from(serverSetupSteps)
        .where(inArray(serverSetupSteps.step, [...prerequisites]));
    const incomplete = prerequisites.find(
        (prerequisite) => rows.find((row) => row.step === prerequisite)?.state !== "complete",
    );
    if (incomplete)
        throw new SetupError(
            "conflict",
            `Setup step ${step} requires ${incomplete} to be complete`,
        );
}
