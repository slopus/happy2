import { messageItemProject } from "../chat/messageProject.js";
import type { MessageActionContext } from "../message/messageActionContext.js";
import type { ReactionSelector } from "./reactionTypes.js";

/** Removes one reaction durably and reconciles its summary without loading actor details. */
export async function reactionRemove(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
    input: ReactionSelector,
): Promise<void> {
    const result = await context.runtime.operation("removeReaction", { messageId, ...input });
    context.chatGet(chatId)?.chatInput({
        type: "messageUpserted",
        item: messageItemProject(context.identities, result.message),
    });
}
