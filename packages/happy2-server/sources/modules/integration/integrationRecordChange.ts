import { type DrizzleTransaction } from "../drizzle.js";
import { type IntegrationChange } from "../integrations/types.js";
import { eq, sql } from "drizzle-orm";
import { serverSyncState, syncEvents } from "../schema.js";

/**
 * Allocates the next serverSyncState sequence and inserts the integration-scoped syncEvents hint for a completed change.
 * Requiring the mutation transaction ensures clients are never notified about an integration version that failed to commit.
 */
export async function integrationRecordChange(
    tx: DrizzleTransaction,
    actorUserId: string,
    kind: string,
    entityId: string,
): Promise<IntegrationChange> {
    const [state] = await tx
        .update(serverSyncState)
        .set({
            sequence: sql`${serverSyncState.sequence} + 1`,
        })
        .where(eq(serverSyncState.id, 1))
        .returning({
            sequence: serverSyncState.sequence,
        });
    if (!state) throw new Error("Server sync state is not initialized");
    await tx.insert(syncEvents).values({
        sequence: state.sequence,
        kind,
        entityId,
        actorUserId,
    });
    return {
        sequence: String(state.sequence),
        kind,
        entityId,
    };
}
