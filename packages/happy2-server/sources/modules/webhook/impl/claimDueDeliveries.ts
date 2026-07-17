import { type ClaimedDelivery } from "../../integration/claimedDelivery.js";
import { type DrizzleExecutor, withTransaction } from "../../drizzle.js";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { asClaimedDelivery } from "./asClaimedDelivery.js";

import { deliverySelection } from "../../integration/deliverySelection.js";

import { integrations, webhookDeliveries, webhookSubscriptions } from "../../schema.js";

/**
 * Claims a bounded set of due webhookDeliveries by assigning attempt leases only to active, retryable subscriptions.
 * The conditional transaction prevents multiple delivery workers from sending the same webhook attempt concurrently.
 */
export async function claimDueDeliveries(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    limit: number,
    leaseMs: number,
    maxAttempts: number,
): Promise<ClaimedDelivery[]> {
    const now = nowProvider();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    const dueCondition = and(
        sql`${webhookDeliveries.attempts} < ${maxAttempts}`,
        or(
            sql`${webhookDeliveries.status} in ('pending', 'failed')`,
            and(
                eq(webhookDeliveries.status, "delivering"),
                lte(sql`julianday(${webhookDeliveries.nextAttemptAt})`, sql`julianday(${nowIso})`),
            ),
        ),
        lte(sql`julianday(${webhookDeliveries.nextAttemptAt})`, sql`julianday(${nowIso})`),
        eq(webhookSubscriptions.active, 1),
        eq(webhookSubscriptions.direction, "outgoing"),
        eq(integrations.active, 1),
        isNull(integrations.deletedAt),
    );
    const [candidate] = await executor
        .select({
            id: webhookDeliveries.id,
        })
        .from(webhookDeliveries)
        .innerJoin(
            webhookSubscriptions,
            eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
        )
        .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
        .where(dueCondition)
        .limit(1);
    if (!candidate) return [];
    return withTransaction(executor, async (tx) => {
        const due = await tx
            .select({
                id: webhookDeliveries.id,
            })
            .from(webhookDeliveries)
            .innerJoin(
                webhookSubscriptions,
                eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
            )
            .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
            .where(dueCondition)
            .orderBy(asc(webhookDeliveries.nextAttemptAt), asc(webhookDeliveries.id))
            .limit(limit);
        const claimed: ClaimedDelivery[] = [];
        for (const candidate of due) {
            const id = candidate.id;
            const changed = await tx
                .update(webhookDeliveries)
                .set({
                    status: "delivering",
                    attempts: sql`${webhookDeliveries.attempts} + 1`,
                    nextAttemptAt: leaseUntil,
                })
                .where(
                    and(
                        eq(webhookDeliveries.id, id),
                        sql`${webhookDeliveries.attempts} < ${maxAttempts}`,
                        or(
                            sql`${webhookDeliveries.status} in ('pending', 'failed')`,
                            and(
                                eq(webhookDeliveries.status, "delivering"),
                                lte(
                                    sql`julianday(${webhookDeliveries.nextAttemptAt})`,
                                    sql`julianday(${now.toISOString()})`,
                                ),
                            ),
                        ),
                    ),
                )
                .returning({
                    id: webhookDeliveries.id,
                });
            if (changed.length === 0) continue;
            const [row] = await tx
                .select({
                    ...deliverySelection,
                    payload_json: webhookDeliveries.payloadJson,
                    url: webhookSubscriptions.url,
                    signing_secret_ciphertext: webhookSubscriptions.signingSecretCiphertext,
                })
                .from(webhookDeliveries)
                .innerJoin(
                    webhookSubscriptions,
                    eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
                )
                .where(eq(webhookDeliveries.id, id));
            if (row) claimed.push(asClaimedDelivery(row));
        }
        return claimed;
    });
}
