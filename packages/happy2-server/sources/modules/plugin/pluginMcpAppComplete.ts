import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import type { MutationHint } from "../chat/types.js";
import { pluginMcpAppCalls } from "../schema.js";
import { PluginError } from "./types.js";
import { pluginResultMessageChanged } from "./impl/pluginResultMessageChanged.js";

const MAX_APP_RESULT_JSON_BYTES = 4 * 1024 * 1024;

/**
 * Stores the terminal MCP result and status for one previously begun app call so the original tool-result notification can be replayed whenever its chat message is reopened.
 * This action updates pluginMcpAppCalls and advances an already-linked assistant messages row in one transaction after external execution settles.
 */
export async function pluginMcpAppComplete(
    executor: DrizzleExecutor,
    input: {
        sessionId: string;
        callId: string;
        status: "completed" | "failed";
        result: Readonly<Record<string, unknown>>;
    },
): Promise<MutationHint | undefined> {
    const resultJson = JSON.stringify(input.result);
    if (Buffer.byteLength(resultJson, "utf8") > MAX_APP_RESULT_JSON_BYTES)
        throw new PluginError("broken_configuration", "Plugin MCP App tool result is too large");
    return withTransaction(executor, async (tx) => {
        const [current] = await tx
            .select({
                userMessageId: pluginMcpAppCalls.userMessageId,
                agentUserId: pluginMcpAppCalls.agentUserId,
                status: pluginMcpAppCalls.status,
                resultJson: pluginMcpAppCalls.resultJson,
            })
            .from(pluginMcpAppCalls)
            .where(
                and(
                    eq(pluginMcpAppCalls.sessionId, input.sessionId),
                    eq(pluginMcpAppCalls.callId, input.callId),
                ),
            )
            .limit(1);
        if (!current) throw new Error("MCP App call was not begun before completion");
        if (current.status === input.status && current.resultJson === resultJson) return undefined;
        const rows = await tx
            .update(pluginMcpAppCalls)
            .set({ status: input.status, resultJson, updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(
                and(
                    eq(pluginMcpAppCalls.sessionId, input.sessionId),
                    eq(pluginMcpAppCalls.callId, input.callId),
                ),
            )
            .returning({ callId: pluginMcpAppCalls.callId });
        if (rows.length !== 1) throw new Error("MCP App call disappeared during completion");
        return pluginResultMessageChanged(tx, {
            sessionId: input.sessionId,
            userMessageId: current.userMessageId,
            agentUserId: current.agentUserId,
        });
    });
}
