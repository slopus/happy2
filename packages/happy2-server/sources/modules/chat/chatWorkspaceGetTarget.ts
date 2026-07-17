import { type ChatWorkspaceTarget } from "./impl/chatWorkspaceTarget.js";
import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";
import { eq } from "drizzle-orm";
import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Resolves an active member's channel workspace or the sole Rig working directory bound to a direct message.
 * Returning not-found for missing or ambiguous DM bindings prevents callers from reading or copying files from an arbitrary agent session.
 */
export async function chatWorkspaceGetTarget(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<ChatWorkspaceTarget> {
    const chat = await chatGetAccess(executor, userId, chatId, true);
    if (!chat) throw new CollaborationError("not_found", "Chat workspace was not found");
    if (chat.kind !== "dm")
        return {
            chatId: chat.id,
            source: "channel",
        };
    const bindings = await executor
        .select({
            cwd: agentRigBindings.cwd,
        })
        .from(agentRigBindings)
        .where(eq(agentRigBindings.chatId, chatId))
        .orderBy(agentRigBindings.userId)
        .limit(2);
    if (bindings.length !== 1)
        throw new CollaborationError("not_found", "Chat workspace was not found");
    return {
        chatId: chat.id,
        source: "rig",
        cwd: bindings[0]!.cwd,
    };
}
