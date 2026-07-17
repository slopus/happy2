import { messageItemProject } from "../chat/messageProject.js";
import type { MessageActionContext } from "./messageActionContext.js";

/** Persists an edit and replaces only its materialized message projection. */
export async function messageEdit(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
    text: string,
    expectedRevision: number,
): Promise<void> {
    const result = await context.runtime.operation("editMessage", {
        messageId,
        text,
        expectedRevision,
    });
    context.chatGet(chatId)?.chatInput({
        type: "messageUpserted",
        item: messageItemProject(context.identities, result.message),
    });
}
