import { type DrizzleExecutor } from "../drizzle.js";
import { type RegistrationAvailability } from "./types.js";
import { setupGetPublicStatus } from "./setupGetPublicStatus.js";
/**
 * Returns bootstrap, open, or closed registration availability after applying the complete server-setup state machine.
 * Reusing the public-status derivation prevents authentication providers from interpreting incomplete onboarding differently from setup routes.
 */
export async function setupGetRegistrationAvailability(
    executor: DrizzleExecutor,
): Promise<RegistrationAvailability> {
    return (await setupGetPublicStatus(executor)).registration;
}
