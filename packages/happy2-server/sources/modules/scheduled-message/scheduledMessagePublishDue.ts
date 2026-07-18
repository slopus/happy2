import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { areaHint } from "./areaHint.js";

import { errorMessage } from "./errorMessage.js";

import { messageSend } from "../message/messageSend.js";

import { scheduledMessages } from "../schema.js";

import { getScheduledMessageWith } from "./impl/getScheduledMessageWith.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Claims due scheduledMessages with a short publishing lease, sends each through the normal message path, then records a published or failed terminal state.
 * A schedule-derived client mutation key deduplicates retries across the separate claim, message, and completion transactions after worker interruption.
 */
export async function scheduledMessagePublishDue(
    executor: DrizzleExecutor,
    limit = 25,
): Promise<MutationHint[]> {
    const due = await executor
        .select({
            id: scheduledMessages.id,
            actorUserId: scheduledMessages.createdByUserId,
        })
        .from(scheduledMessages)
        .where(
            or(
                and(
                    eq(scheduledMessages.status, "scheduled"),
                    lte(sql`datetime(${scheduledMessages.scheduledFor})`, sql`CURRENT_TIMESTAMP`),
                ),
                and(
                    eq(scheduledMessages.status, "publishing"),
                    lte(
                        sql`datetime(${scheduledMessages.updatedAt})`,
                        sql`datetime('now', '-1 minute')`,
                    ),
                ),
            ),
        )
        .orderBy(asc(scheduledMessages.scheduledFor), asc(scheduledMessages.id))
        .limit(limit);
    const hints: MutationHint[] = [];
    for (const row of due) {
        if (!row.actorUserId) continue;
        const actorUserId = row.actorUserId;
        const [claimed] = await executor
            .update(scheduledMessages)
            .set({
                status: "publishing",
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(scheduledMessages.id, row.id),
                    or(
                        eq(scheduledMessages.status, "scheduled"),
                        and(
                            eq(scheduledMessages.status, "publishing"),
                            lte(
                                sql`datetime(${scheduledMessages.updatedAt})`,
                                sql`datetime('now', '-1 minute')`,
                            ),
                        ),
                    ),
                ),
            )
            .returning({
                id: scheduledMessages.id,
            });
        if (!claimed) continue;
        let sent: Awaited<ReturnType<typeof messageSend>>;
        try {
            const scheduled = await getScheduledMessageWith(executor, actorUserId, row.id);
            const [detail] = await executor
                .select({
                    quotedMessageId: scheduledMessages.quotedMessageId,
                })
                .from(scheduledMessages)
                .where(eq(scheduledMessages.id, row.id));
            sent = await messageSend(executor, {
                actorUserId,
                chatId: scheduled.chatId,
                text: scheduled.text,
                attachmentFileIds: scheduled.attachmentFileIds,
                quotedMessageId: detail?.quotedMessageId ?? undefined,
                clientMutationId: `scheduled:${row.id}`,
            });
        } catch (error) {
            hints.push(
                await withTransaction(executor, async (tx) => {
                    await tx
                        .update(scheduledMessages)
                        .set({
                            status: "failed",
                            lastError: errorMessage(error),
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        })
                        .where(eq(scheduledMessages.id, row.id));
                    const sequence = await syncSequenceNext(tx);
                    await syncEventInsert(tx, {
                        sequence,
                        kind: "scheduled.failed",
                        entityId: row.id,
                        actorUserId,
                        targetUserId: actorUserId,
                    });
                    return areaHint(sequence, "scheduled-messages");
                }),
            );
            continue;
        }
        const areaHintValue = await withTransaction(executor, async (tx) => {
            await tx
                .update(scheduledMessages)
                .set({
                    status: "published",
                    publishedMessageId: sent.message.id,
                    publishedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(scheduledMessages.id, row.id));
            const sequence = await syncSequenceNext(tx);
            await syncEventInsert(tx, {
                sequence,
                kind: "scheduled.published",
                entityId: row.id,
                actorUserId,
                targetUserId: actorUserId,
            });
            return areaHint(sequence, "scheduled-messages");
        });
        hints.push(sent.hint, areaHintValue);
    }
    return hints;
}
