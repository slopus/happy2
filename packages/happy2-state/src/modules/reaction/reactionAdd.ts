import { messageItemProject } from "../chat/messageProject.js";
import type { MessageActionContext } from "../message/messageActionContext.js";
import type { ReactionSelector } from "./reactionTypes.js";

/** Adds one reaction durably and reconciles its summary without materializing actor details. */
export async function reactionAdd(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
    input: ReactionSelector,
): Promise<void> {
    const result = await context.runtime.operation("addReaction", { messageId, ...input });
    context.chatGet(chatId)?.chatInput({
        type: "messageUpserted",
        item: messageItemProject(context.identities, result.message),
    });
}
