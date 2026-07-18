import type { DrizzleExecutor } from "../drizzle.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

/**
 * Requires an active server administrator before plugin package or configuration work begins.
 * This read-only authorization boundary does not mutate durable state and prevents unauthorised callers from triggering package-copy or lifecycle side effects.
 */
export async function pluginAuthorizeManagement(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<void> {
    await userRequireServerAdmin(executor, actorUserId);
}
