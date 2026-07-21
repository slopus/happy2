import { and, eq } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";

/**
 * Returns the current durable agentRigBindings container identity for one exact agent and chat without applying user-facing authorization.
 * Port-share routing uses this internal lookup to recover when another server process has already committed a replacement for its stale in-memory share snapshot.
 */
export async function agentContainerGetBoundName(
    executor: DrizzleExecutor,
    agentUserId: string,
    chatId: string,
): Promise<string | undefined> {
    const [binding] = await executor
        .select({ containerName: agentRigBindings.containerName })
        .from(agentRigBindings)
        .where(and(eq(agentRigBindings.userId, agentUserId), eq(agentRigBindings.chatId, chatId)))
        .limit(1);
    return binding?.containerName;
}
