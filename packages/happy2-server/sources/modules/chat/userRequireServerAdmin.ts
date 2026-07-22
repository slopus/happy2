import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { userIsServerAdminDb } from "./impl/userIsServerAdminDb.js";

/**
 * Requires an active users identity with durable-owner or built-in administrator authority.
 * The immutable built-in marker, rather than the role's editable name or legacy user label, remains the generic administration boundary.
 */
export async function userRequireServerAdmin(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    if (!(await userIsServerAdminDb(executor, userId)))
        throw new CollaborationError("forbidden", "Server admin permission is required");
}
