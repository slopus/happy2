import { and, eq, exists, isNull } from "drizzle-orm";
import type { DrizzleExecutor } from "../../drizzle.js";
import { users } from "../../schema.js";

/** Builds the durable users.active predicate shared by guarded agent execution writes. */
export function agentActiveExists(executor: DrizzleExecutor, agentUserId: string) {
    return exists(
        executor
            .select({ id: users.id })
            .from(users)
            .where(
                and(
                    eq(users.id, agentUserId),
                    eq(users.kind, "agent"),
                    eq(users.active, 1),
                    isNull(users.deletedAt),
                ),
            ),
    );
}
