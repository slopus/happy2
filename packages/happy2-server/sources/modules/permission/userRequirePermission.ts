import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { permissionEffectiveDb } from "./impl/permissionEffectiveDb.js";
import type { Permission } from "./types.js";

/**
 * Requires one effective permission from an active human user, treating the durable server owner as an explicit allow-all principal.
 * Centralizing this check prevents feature routes from confusing legacy administrator labels with narrowly delegated authority.
 */
export async function userRequirePermission(
    executor: DrizzleExecutor,
    userId: string,
    permission: Permission,
): Promise<void> {
    const effective = await permissionEffectiveDb(executor, userId);
    if (!effective?.allowed.includes(permission))
        throw new CollaborationError("forbidden", `${permission} permission is required`);
}
