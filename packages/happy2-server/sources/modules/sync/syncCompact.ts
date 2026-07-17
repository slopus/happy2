import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
    chats,
    chatSyncCompactions,
    chatUpdates,
    clientMutations,
    idempotencyKeys,
    serverSettings,
    serverSyncState,
    syncCompactions,
    syncConsumers,
    syncEvents,
} from "../schema.js";

import { createId } from "@paralleldrive/cuid2";

import { number } from "../chat/number.js";

/**
 * Records a syncCompactions boundary and prunes syncEvents, chatUpdates, clientMutations, and idempotencyKeys that fall safely behind retained cursors.
 * One compaction transaction prevents clients from being told a boundary is usable before every associated history set has been pruned consistently.
 */
export async function syncCompact(executor: DrizzleExecutor): Promise<{
    minRecoverableSequence: string;
    eventsDeleted: number;
    mutationsDeleted: number;
    chatUpdatesDeleted: number;
}> {
    return withTransaction(executor, async (tx) => {
        const [state] = await tx
            .select({
                generation: serverSyncState.generation,
                sequence: serverSyncState.sequence,
                minRecoverableSequence: serverSyncState.minRecoverableSequence,
            })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1));
        const [settings] = await tx
            .select({
                syncEventRetentionSeconds: serverSettings.syncEventRetentionSeconds,
                chatUpdateRetentionSeconds: serverSettings.chatUpdateRetentionSeconds,
                idempotencyRetentionSeconds: serverSettings.idempotencyRetentionSeconds,
            })
            .from(serverSettings)
            .where(eq(serverSettings.id, 1));
        if (!state || !settings) throw new Error("Sync retention settings are missing");
        const retentionSeconds = settings.syncEventRetentionSeconds;
        const [candidate] = await tx
            .select({
                sequence: sql<number>`coalesce(max(${syncEvents.sequence}), 0)`,
            })
            .from(syncEvents)
            .where(
                sql`datetime(${syncEvents.createdAt}) < datetime('now', '-' || ${retentionSeconds} || ' seconds')`,
            );
        const [activeFloor] = await tx
            .select({
                sequence: sql<number | null>`min(${syncConsumers.sequence})`,
            })
            .from(syncConsumers)
            .where(
                and(
                    isNull(syncConsumers.revokedAt),
                    eq(syncConsumers.generation, state.generation),
                    sql`datetime(${syncConsumers.lastSeenAt}) >= datetime('now', '-90 days')`,
                ),
            );
        const previousMin = state.minRecoverableSequence;
        const candidateSequence = number(candidate?.sequence, 0);
        const consumerSequence =
            activeFloor?.sequence === null || activeFloor?.sequence === undefined
                ? state.sequence
                : number(activeFloor.sequence);
        const newMin = Math.max(previousMin, Math.min(candidateSequence, consumerSequence));
        const compactionId = createId();
        await tx.insert(syncCompactions).values({
            id: compactionId,
            generation: state.generation,
            previousMinSequence: previousMin,
            newMinSequence: newMin,
        });
        const deletedEvents =
            newMin > previousMin
                ? await tx.delete(syncEvents).where(lte(syncEvents.sequence, newMin)).returning({
                      id: syncEvents.id,
                  })
                : [];
        const mutationRetention = settings.idempotencyRetentionSeconds;
        const deletedMutations = await tx
            .delete(clientMutations)
            .where(
                or(
                    and(
                        sql`${clientMutations.expiresAt} IS NOT NULL`,
                        sql`datetime(${clientMutations.expiresAt}) <= CURRENT_TIMESTAMP`,
                    ),
                    sql`datetime(${clientMutations.createdAt}) < datetime('now', '-' || ${mutationRetention} || ' seconds')`,
                ),
            )
            .returning({
                actorUserId: clientMutations.actorUserId,
            });
        await tx
            .delete(idempotencyKeys)
            .where(sql`datetime(${idempotencyKeys.expiresAt}) <= CURRENT_TIMESTAMP`);
        const chatRetention = settings.chatUpdateRetentionSeconds;
        const compactedChats = await tx
            .select({
                chatId: chatUpdates.chatId,
                newMinPts: sql<number>`max(${chatUpdates.pts})`,
            })
            .from(chatUpdates)
            .where(
                sql`datetime(${chatUpdates.createdAt}) < datetime('now', '-' || ${chatRetention} || ' seconds')`,
            )
            .groupBy(chatUpdates.chatId);
        let chatUpdatesDeleted = 0;
        for (const chat of compactedChats) {
            const chatId = chat.chatId;
            const newMinPts = chat.newMinPts;
            const [current] = await tx
                .select({
                    minRecoverablePts: chats.minRecoverablePts,
                })
                .from(chats)
                .where(eq(chats.id, chatId));
            const previousMinPts = current?.minRecoverablePts ?? 0;
            if (newMinPts <= previousMinPts) continue;
            const deleted = await tx
                .delete(chatUpdates)
                .where(and(eq(chatUpdates.chatId, chatId), lte(chatUpdates.pts, newMinPts)))
                .returning({
                    pts: chatUpdates.pts,
                });
            chatUpdatesDeleted += deleted.length;
            await tx
                .update(chats)
                .set({
                    minRecoverablePts: newMinPts,
                })
                .where(eq(chats.id, chatId));
            await tx.insert(chatSyncCompactions).values({
                id: createId(),
                chatId,
                previousMinPts,
                newMinPts,
                updatesDeleted: deleted.length,
            });
        }
        await tx
            .update(serverSyncState)
            .set({
                minRecoverableSequence: newMin,
                lastCompactedAt: sql`CURRENT_TIMESTAMP`,
                compactionVersion: sql`${serverSyncState.compactionVersion} + 1`,
            })
            .where(eq(serverSyncState.id, 1));
        await tx
            .update(syncCompactions)
            .set({
                eventsDeleted: deletedEvents.length,
                mutationsDeleted: deletedMutations.length,
                completedAt: sql`CURRENT_TIMESTAMP`,
                detailsJson: JSON.stringify({
                    chatUpdatesDeleted,
                }),
            })
            .where(eq(syncCompactions.id, compactionId));
        return {
            minRecoverableSequence: String(newMin),
            eventsDeleted: deletedEvents.length,
            mutationsDeleted: deletedMutations.length,
            chatUpdatesDeleted,
        };
    });
}
