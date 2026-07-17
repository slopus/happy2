import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { serverSetupSteps } from "../schema.js";
import { safeMetadata } from "./impl/safeMetadata.js";

/**
 * Resolves the provider whose selection and validation are both complete in serverSetupSteps without mutating durable state.
 * Keeping this strict read boundary separate prevents agent operations from trusting incomplete or mismatched setup metadata after restart.
 */
export async function setupSandboxProviderGetSelected(
    executor: DrizzleExecutor,
): Promise<{ id: string; version?: string } | undefined> {
    const rows = await executor
        .select({
            step: serverSetupSteps.step,
            state: serverSetupSteps.state,
            metadataJson: serverSetupSteps.metadataJson,
        })
        .from(serverSetupSteps)
        .where(
            and(
                inArray(serverSetupSteps.step, [
                    "sandbox_provider_selected",
                    "sandbox_provider_validated",
                ]),
                eq(serverSetupSteps.state, "complete"),
            ),
        );
    if (rows.length !== 2) return undefined;
    const selected = safeMetadata(
        rows.find(({ step }) => step === "sandbox_provider_selected")?.metadataJson,
    );
    const validated = safeMetadata(
        rows.find(({ step }) => step === "sandbox_provider_validated")?.metadataJson,
    );
    const selectedId = selected?.providerId;
    const validatedId = validated?.providerId;
    if (
        typeof selectedId !== "string" ||
        typeof validatedId !== "string" ||
        selectedId !== validatedId
    )
        return undefined;
    return {
        id: selectedId,
        ...(typeof validated?.version === "string" ? { version: validated.version } : {}),
    };
}
