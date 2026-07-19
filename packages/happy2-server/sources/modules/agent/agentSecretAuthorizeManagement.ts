import { type DrizzleExecutor } from "../drizzle.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import type { Permission } from "../permission/types.js";
/**
 * Requires the actor's requested secret-management capability before any external Rig secret operation proceeds.
 * A shared authorization entry point keeps non-database secret lifecycle work aligned with the same grants enforced by durable actions.
 */
export async function agentSecretAuthorizeManagement(
    executor: DrizzleExecutor,
    actorUserId: string,
    permission: Extract<Permission, "manageSecrets" | "assignSecrets">,
): Promise<void> {
    await userRequirePermission(executor, actorUserId, permission);
}
