import { type DrizzleExecutor } from "../../drizzle.js";
import {
    type SetupStepStatus,
    USER_ONBOARDING_STEPS,
    type UserOnboardingStepState,
} from "../types.js";

import { type UserStepRecord } from "./userStepRecord.js";
import { emptyUserSteps } from "./emptyUserSteps.js";
import { eq } from "drizzle-orm";
import { stepStatus } from "./stepStatus.js";
import { userOnboardingSteps } from "../../schema.js";
/** Reads a user's durable onboarding outcomes and fills absent rows with pending steps. */
export async function readUserSteps(
    executor: DrizzleExecutor,
    userId: string,
): Promise<UserStepRecord> {
    const rows = await executor
        .select()
        .from(userOnboardingSteps)
        .where(eq(userOnboardingSteps.userId, userId));
    const byStep = new Map(rows.map((row) => [row.step, row]));
    const steps = emptyUserSteps();
    for (const step of USER_ONBOARDING_STEPS) {
        const row = byStep.get(step);
        if (row) steps[step] = stepStatus(row) as SetupStepStatus<UserOnboardingStepState>;
    }
    return steps;
}
