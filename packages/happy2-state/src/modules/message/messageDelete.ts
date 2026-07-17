import { messageItemProject } from "../chat/messageProject.js";
import type { MessageActionContext } from "./messageActionContext.js";

/** Persists deletion and reconciles the server's deleted-message projection if materialized. */
export async function messageDelete(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
): Promise<void> {
    const result = await context.runtime.operation("deleteMessage", { messageId });
    context.chatGet(chatId)?.chatInput({
        type: "messageUpserted",
        item: messageItemProject(context.identities, result.message),
    });
}
