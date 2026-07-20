import { and, eq, exists, or } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurns, pluginMcpAppCalls } from "../schema.js";

/**
 * Deletes pluginMcpAppCalls inputs and results owned by a user or assistant message that is being tombstoned.
 * The caller supplies its existing message transaction so ephemeral expiry or moderation cannot leave sensitive app payloads recoverable after visible content is removed.
 */
export async function pluginMcpAppsDeleteForMessage(
    executor: DrizzleExecutor,
    messageId: string,
): Promise<void> {
    await executor.delete(pluginMcpAppCalls).where(
        or(
            eq(pluginMcpAppCalls.userMessageId, messageId),
            exists(
                executor
                    .select({ value: agentTurns.sessionId })
                    .from(agentTurns)
                    .where(
                        and(
                            eq(agentTurns.assistantMessageId, messageId),
                            eq(agentTurns.sessionId, pluginMcpAppCalls.sessionId),
                            eq(agentTurns.userMessageId, pluginMcpAppCalls.userMessageId),
                            eq(agentTurns.agentUserId, pluginMcpAppCalls.agentUserId),
                        ),
                    ),
            ),
        ),
    );
}
