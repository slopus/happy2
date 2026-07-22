import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";
import { eq } from "drizzle-orm";

/**
 * Reads the active agentRigBindings session ids whose runtime model is owned by one chat.
 * It does not mutate durable state; keeping this projection separate lets the service reconcile
 * the external Rig sessions only after the chat-model transaction has committed.
 */
export async function agentChatBindingList(
    executor: DrizzleExecutor,
    chatId: string,
): Promise<Array<{ sessionId: string }>> {
    return executor
        .select({ sessionId: agentRigBindings.sessionId })
        .from(agentRigBindings)
        .where(eq(agentRigBindings.chatId, chatId));
}
