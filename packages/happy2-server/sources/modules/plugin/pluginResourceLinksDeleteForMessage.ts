import { and, eq, exists, or } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurns, pluginResourceLinks } from "../schema.js";

/**
 * Deletes durable pluginResourceLinks card payloads owned by a user or assistant message without opening its own transaction.
 * The tombstone caller composes this boundary in the same transaction so deleted or expired chat content no longer retains its native resource-card projection.
 */
export async function pluginResourceLinksDeleteForMessage(
    executor: DrizzleExecutor,
    messageId: string,
): Promise<void> {
    await executor.delete(pluginResourceLinks).where(
        or(
            eq(pluginResourceLinks.userMessageId, messageId),
            exists(
                executor
                    .select({ value: agentTurns.sessionId })
                    .from(agentTurns)
                    .where(
                        and(
                            eq(agentTurns.assistantMessageId, messageId),
                            eq(agentTurns.sessionId, pluginResourceLinks.sessionId),
                            eq(agentTurns.userMessageId, pluginResourceLinks.userMessageId),
                            eq(agentTurns.agentUserId, pluginResourceLinks.agentUserId),
                        ),
                    ),
            ),
        ),
    );
}
