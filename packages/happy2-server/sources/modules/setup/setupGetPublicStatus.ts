import { type DrizzleExecutor } from "../drizzle.js";
import { type PublicServerSetupStatus } from "./types.js";
import { publicStatus } from "./impl/publicStatus.js";
import { readServerSnapshot } from "./impl/readServerSnapshot.js";
/**
 * Derives the public bootstrap, configuration, or complete phase and registration availability from the validated durable setup snapshot.
 * Publishing only this reduced status lets unauthenticated clients choose the correct entry flow without exposing setup metadata or errors.
 */
export async function setupGetPublicStatus(
    executor: DrizzleExecutor,
): Promise<PublicServerSetupStatus> {
    const snapshot = await readServerSnapshot(executor);
    return publicStatus(snapshot);
}
