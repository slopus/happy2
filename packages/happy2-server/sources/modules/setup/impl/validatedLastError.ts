import { type ServerSetupStepState, SetupError } from "../types.js";

export function validatedLastError(
    state: ServerSetupStepState,
    value: string | undefined,
): string | undefined {
    const normalized = value?.trim();
    if (state === "failed" && !normalized)
        throw new SetupError("invalid", "A failed setup step requires lastError");
    if (state !== "failed" && normalized)
        throw new SetupError("invalid", "Only a failed setup step may include lastError");
    if (normalized && normalized.length > 2_000)
        throw new SetupError("invalid", "Setup lastError exceeds 2000 characters");
    return normalized;
}
