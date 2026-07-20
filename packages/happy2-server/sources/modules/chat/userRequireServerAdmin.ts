import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { userIsServerAdminDb } from "./impl/userIsServerAdminDb.js";

/**
 * Requires the durable owner or a member of the built-in administrator role backed by an active account.
 * The immutable built-in marker, rather than the role's editable name or legacy user label, remains the generic administration boundary.
 */
export async function userRequireServerAdmin(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    if (!(await userIsServerAdminDb(executor, userId)))
        throw new CollaborationError("forbidden", "Server admin permission is required");
}
