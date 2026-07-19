import type { DrizzleExecutor } from "../drizzle.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Requires managePlugins permission before plugin package or configuration work begins.
 * This read-only authorization boundary does not mutate durable state and prevents unauthorised callers from triggering package-copy or lifecycle side effects.
 */
export async function pluginAuthorizeManagement(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<void> {
    await userRequirePermission(executor, actorUserId, "managePlugins");
}
