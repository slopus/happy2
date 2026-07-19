import { and, eq, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { pluginFunctionResults } from "../schema.js";
import { parsePluginFunctionResult } from "./impl/pluginFunctionResult.js";
import type { PluginFunctionResult } from "./types.js";

export type PluginFunctionResultAcquireResult =
    | { kind: "acquired" }
    | { kind: "in_progress"; retryAt: number }
    | { kind: "replay"; result: PluginFunctionResult };

/**
 * Creates, replays, waits for, or conditionally takes over the durable pluginFunctionResults lease for one Rig call.
 * The transaction admits one live MCP executor at a time while retaining a completed outcome indefinitely for event redelivery and restart recovery.
 */
export async function pluginFunctionResultAcquire(
    executor: DrizzleExecutor,
    input: {
        callId: string;
        leaseExpiresAt: number;
        leaseToken: string;
        now: number;
        sessionId: string;
    },
): Promise<PluginFunctionResultAcquireResult> {
    return withTransaction(executor, async (tx) => {
        const lockedUntil = new Date(input.leaseExpiresAt).toISOString();
        const [inserted] = await tx
            .insert(pluginFunctionResults)
            .values({
                sessionId: input.sessionId,
                callId: input.callId,
                leaseToken: input.leaseToken,
                lockedUntil,
            })
            .onConflictDoNothing()
            .returning({ callId: pluginFunctionResults.callId });
        if (inserted) return { kind: "acquired" };
        const [row] = await tx
            .select({
                lockedUntil: pluginFunctionResults.lockedUntil,
                resolutionJson: pluginFunctionResults.resolutionJson,
                status: pluginFunctionResults.status,
            })
            .from(pluginFunctionResults)
            .where(
                and(
                    eq(pluginFunctionResults.sessionId, input.sessionId),
                    eq(pluginFunctionResults.callId, input.callId),
                ),
            )
            .limit(1);
        if (!row) throw new Error("Plugin function result disappeared during acquisition");
        if (row?.status === "completed") {
            if (row.resolutionJson === null)
                throw new Error("Completed plugin function result is missing its resolution");
            return { kind: "replay", result: parsePluginFunctionResult(row.resolutionJson) };
        }
        if (row?.lockedUntil && Date.parse(row.lockedUntil) > input.now)
            return { kind: "in_progress", retryAt: Date.parse(row.lockedUntil) };
        await tx
            .update(pluginFunctionResults)
            .set({
                leaseToken: input.leaseToken,
                lockedUntil,
                status: "in_progress",
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginFunctionResults.sessionId, input.sessionId),
                    eq(pluginFunctionResults.callId, input.callId),
                ),
            );
        return { kind: "acquired" };
    });
}
