import { and, eq, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { pluginFunctionResults } from "../schema.js";

/** Renews one in-progress pluginFunctionResults lease only for its current fenced executor. This lets a known blocking document-approval wait extend durable ownership without lengthening unrelated function leases, and lets the caller restore the ordinary lease once the wait ends. */
export async function pluginFunctionResultRenewLease(
    executor: DrizzleExecutor,
    input: {
        callId: string;
        leaseExpiresAt: number;
        leaseToken: string;
        sessionId: string;
    },
): Promise<void> {
    return withTransaction(executor, async (tx) => {
        const [renewed] = await tx
            .update(pluginFunctionResults)
            .set({
                lockedUntil: new Date(input.leaseExpiresAt).toISOString(),
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginFunctionResults.sessionId, input.sessionId),
                    eq(pluginFunctionResults.callId, input.callId),
                    eq(pluginFunctionResults.status, "in_progress"),
                    eq(pluginFunctionResults.leaseToken, input.leaseToken),
                ),
            )
            .returning({ callId: pluginFunctionResults.callId });
        if (!renewed) throw new Error("Plugin function result lease was lost before renewal");
    });
}
