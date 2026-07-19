import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";

/**
 * Resolves the one current chat bound to a Rig session so agent-originated capabilities cannot be detached from their durable conversation.
 * Returning no ID for missing or ambiguous bindings prevents an external tool call from receiving authority over an inferred chat.
 */
export async function agentChatGetIdBySession(
    executor: DrizzleExecutor,
    sessionId: string,
): Promise<string | undefined> {
    const rows = await executor
        .select({ chatId: agentRigBindings.chatId })
        .from(agentRigBindings)
        .where(eq(agentRigBindings.sessionId, sessionId))
        .limit(2);
    return rows.length === 1 ? rows[0]!.chatId : undefined;
}
