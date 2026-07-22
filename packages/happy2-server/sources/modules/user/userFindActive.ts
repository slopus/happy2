import { type DrizzleExecutor } from "../drizzle.js";
import { type User } from "./types.js";
import { users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asUser } from "./impl/asUser.js";

/**
 * Resolves an active product identity directly from the authoritative users lifecycle state.
 * This lookup intentionally does not infer product access from credential-account state.
 */
export async function userFindActive(
    executor: DrizzleExecutor,
    id: string,
): Promise<User | undefined> {
    const [row] = await executor
        .select({
            user: users,
        })
        .from(users)
        .where(and(eq(users.id, id), eq(users.active, 1), isNull(users.deletedAt)));
    return row ? asUser(row.user) : undefined;
}
