import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";
import { eq } from "drizzle-orm";
import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Reports workspace access for a current chat member, accepting channels directly and DMs only when exactly one Rig binding supplies the workspace.
 * Rejecting zero or multiple DM bindings avoids selecting an ambiguous filesystem target for file operations.
 */
export async function chatWorkspaceCanAccess(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const chat = await chatGetAccess(executor, userId, chatId, true);
    if (!chat) return false;
    if (chat.kind !== "dm") return true;
    const bindings = await executor
        .select({
            cwd: agentRigBindings.cwd,
        })
        .from(agentRigBindings)
        .where(eq(agentRigBindings.chatId, chatId))
        .orderBy(agentRigBindings.userId)
        .limit(2);
    return bindings.length === 1;
}
