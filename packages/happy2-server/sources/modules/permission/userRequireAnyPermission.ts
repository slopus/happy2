import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { permissionEffectiveDb } from "./impl/permissionEffectiveDb.js";
import type { Permission } from "./types.js";

/**
 * Requires at least one permission from an explicit set for shared read surfaces used by adjacent management capabilities.
 * The owner remains allow-all, while ordinary users must receive one listed grant directly or through a role.
 */
export async function userRequireAnyPermission(
    executor: DrizzleExecutor,
    userId: string,
    required: readonly Permission[],
): Promise<void> {
    const effective = await permissionEffectiveDb(executor, userId);
    if (!effective || !required.some((permission) => effective.allowed.includes(permission)))
        throw new CollaborationError(
            "forbidden",
            `${required.join(" or ")} permission is required`,
        );
}
