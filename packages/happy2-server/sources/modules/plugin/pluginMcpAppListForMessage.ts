import { and, asc, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurns, pluginMcpAppCalls } from "../schema.js";
import type { PluginMcpAppSummary } from "./types.js";

/**
 * Reads the durable MCP App invocation summaries belonging to one assistant message in call order without loading untrusted resource content or changing state.
 * This boundary keeps the message projection independent from plugin runtime availability while exposing only the identities needed to materialize an app surface.
 */
export async function pluginMcpAppListForMessage(
    executor: DrizzleExecutor,
    assistantMessageId: string,
): Promise<PluginMcpAppSummary[]> {
    const rows = await executor
        .select({
            callId: pluginMcpAppCalls.callId,
            toolName: pluginMcpAppCalls.toolName,
            resourceUri: pluginMcpAppCalls.resourceUri,
            status: pluginMcpAppCalls.status,
        })
        .from(pluginMcpAppCalls)
        .innerJoin(
            agentTurns,
            and(
                eq(agentTurns.userMessageId, pluginMcpAppCalls.userMessageId),
                eq(agentTurns.agentUserId, pluginMcpAppCalls.agentUserId),
                eq(agentTurns.sessionId, pluginMcpAppCalls.sessionId),
            ),
        )
        .where(eq(agentTurns.assistantMessageId, assistantMessageId))
        .orderBy(asc(pluginMcpAppCalls.createdAt), asc(pluginMcpAppCalls.callId));
    return rows.flatMap((row) => {
        if (row.status !== "in_progress" && row.status !== "completed" && row.status !== "failed")
            return [];
        return [{ ...row, status: row.status }];
    });
}
