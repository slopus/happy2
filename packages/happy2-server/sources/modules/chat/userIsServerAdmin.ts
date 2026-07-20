import { type DrizzleExecutor } from "../drizzle.js";

import { userIsServerAdminDb } from "./impl/userIsServerAdminDb.js";

/**
 * Reports whether users identity is an active human with bootstrap or built-in administrator authority from accounts, serverSetupState, userRoles, and roles.
 * This read-only boundary changes no durable state and keeps private-channel discovery from inventing a second administrator definition.
 */
export async function userIsServerAdmin(
    executor: DrizzleExecutor,
    userId: string,
): Promise<boolean> {
    return userIsServerAdminDb(executor, userId);
}
