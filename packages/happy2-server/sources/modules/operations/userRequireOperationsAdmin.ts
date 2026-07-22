import { type DrizzleExecutor } from "../drizzle.js";
import { OperationsError } from "./types.js";
import { userRequireOperationsActive } from "./userRequireOperationsActive.js";
/**
 * Requires an active users profile with the server administrator role for privileged operations work.
 * Separating this role check from ordinary active-user validation gives backup, retention, export, and moderation actions one authorization rule.
 */
export async function userRequireOperationsAdmin(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const user = await userRequireOperationsActive(executor, userId);
    if (user.role !== "admin")
        throw new OperationsError("forbidden", "Administrator access is required");
}
