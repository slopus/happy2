import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { permissionEffectiveDb } from "./impl/permissionEffectiveDb.js";
import type { EffectivePermissions } from "./types.js";

/**
 * Resolves one active human user's effective allow-list as the union of direct and role grants, with the durable server owner receiving every permission.
 * This read boundary is the canonical projection returned to clients and used by server authorization checks.
 */
export async function permissionGetEffective(
    executor: DrizzleExecutor,
    userId: string,
): Promise<EffectivePermissions> {
    const effective = await permissionEffectiveDb(executor, userId);
    if (!effective) throw new CollaborationError("not_found", "User was not found");
    return effective;
}
