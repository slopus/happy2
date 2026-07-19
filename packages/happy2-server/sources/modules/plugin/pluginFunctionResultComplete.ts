import { and, eq, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { pluginFunctionResults } from "../schema.js";
import { parsePluginFunctionResult } from "./impl/pluginFunctionResult.js";
import type { PluginFunctionResult } from "./types.js";

/**
 * Stores the terminal MCP outcome only while the caller owns the pluginFunctionResults lease for the Rig call.
 * Lease fencing prevents a late or superseded executor from replacing the first durable resolution that Rig and every redelivery must observe.
 */
export async function pluginFunctionResultComplete(
    executor: DrizzleExecutor,
    input: {
        callId: string;
        leaseToken: string;
        result: PluginFunctionResult;
        sessionId: string;
    },
): Promise<PluginFunctionResult> {
    return withTransaction(executor, async (tx) => {
        const [completed] = await tx
            .update(pluginFunctionResults)
            .set({
                leaseToken: null,
                lockedUntil: null,
                resolutionJson: JSON.stringify(input.result),
                status: "completed",
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
            .returning({ resolutionJson: pluginFunctionResults.resolutionJson });
        if (completed?.resolutionJson) return parsePluginFunctionResult(completed.resolutionJson);
        const [winner] = await tx
            .select({
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
        if (winner?.status === "completed" && winner.resolutionJson)
            return parsePluginFunctionResult(winner.resolutionJson);
        throw new Error("Plugin function result lease was lost before completion");
    });
}
