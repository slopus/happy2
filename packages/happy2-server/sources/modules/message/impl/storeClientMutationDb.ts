import { type DrizzleTransaction } from "../../drizzle.js";
import { clientMutations, serverSettings } from "../../schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * Inserts the client's idempotency identity and serialized result into clientMutations for the surrounding message operation.
 * Sharing the message transaction guarantees a retry can replay a result only when the original durable mutation actually committed.
 */
export async function storeClientMutationDb(
    tx: DrizzleTransaction,
    actorUserId: string,
    scope: string,
    clientMutationId: string,
    result: Record<string, unknown>,
): Promise<void> {
    const [settings] = await tx
        .select({
            retentionSeconds: serverSettings.idempotencyRetentionSeconds,
        })
        .from(serverSettings)
        .where(eq(serverSettings.id, 1));
    const retention = settings?.retentionSeconds ?? 604800;
    await tx.insert(clientMutations).values({
        actorUserId,
        scope,
        clientMutationId,
        resultJson: JSON.stringify(result),
        expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ${retention} || ' seconds')`,
        lastAccessedAt: sql`CURRENT_TIMESTAMP`,
    });
}
