import { type DrizzleExecutor } from "../drizzle.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
/**
 * Requires the actor to have an active profile and server-administrator role before any agent-secret management operation proceeds.
 * A shared authorization entry point keeps secret assignment routes from drifting to weaker account or profile checks.
 */
export async function agentSecretAuthorizeManagement(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<void> {
    await userRequireServerAdmin(executor, actorUserId);
}
