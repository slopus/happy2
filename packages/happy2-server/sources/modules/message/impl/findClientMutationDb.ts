import { type DrizzleExecutor } from "../../drizzle.js";
import { and, eq, sql } from "drizzle-orm";
import { clientMutations } from "../../schema.js";

/**
 * Loads a clientMutations replay result by actor, scope, and idempotency key, then refreshes that row's lastAccessedAt.
 * Sharing the exact lookup predicate with the touch keeps retention age attached to the result that was actually replayed.
 */
export async function findClientMutationDb(
    executor: DrizzleExecutor,
    actorUserId: string,
    scope: string,
    clientMutationId: string,
): Promise<Record<string, unknown> | undefined> {
    const [row] = await executor
        .select({
            resultJson: clientMutations.resultJson,
        })
        .from(clientMutations)
        .where(
            and(
                eq(clientMutations.actorUserId, actorUserId),
                eq(clientMutations.scope, scope),
                eq(clientMutations.clientMutationId, clientMutationId),
            ),
        )
        .limit(1);
    if (!row) return undefined;
    await executor
        .update(clientMutations)
        .set({
            lastAccessedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
            and(
                eq(clientMutations.actorUserId, actorUserId),
                eq(clientMutations.scope, scope),
                eq(clientMutations.clientMutationId, clientMutationId),
            ),
        );
    return JSON.parse(row.resultJson) as Record<string, unknown>;
}
