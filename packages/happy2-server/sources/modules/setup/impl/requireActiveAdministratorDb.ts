import { users } from "../../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { type DrizzleExecutor } from "../../drizzle.js";

import { SetupError } from "../types.js";

export async function requireActiveAdministratorDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const [admin] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(users.active, 1),
            ),
        );
    if (!admin) throw new SetupError("forbidden", "Server administrator permission is required");
}
