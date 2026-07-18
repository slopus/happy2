import { messageItemProject } from "../chat/chatState.js";
import { type MessageActionContext } from "../message/messageState.js";

/** Adds one reaction durably and reconciles its summary without materializing actor details. */
export async function reactionAdd(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
    input: ReactionSelector,
): Promise<void> {
    const result = await context.runtime.operation("addReaction", { messageId, ...input });
    context
        .chatGet(chatId)
        ?.getState()
        .chatInput({
            type: "messageUpserted",
            item: messageItemProject(context.identities, result.message),
        });
}

/** Removes one reaction durably and reconciles its summary without loading actor details. */
export async function reactionRemove(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
    input: ReactionSelector,
): Promise<void> {
    const result = await context.runtime.operation("removeReaction", { messageId, ...input });
    context
        .chatGet(chatId)
        ?.getState()
        .chatInput({
            type: "messageUpserted",
            item: messageItemProject(context.identities, result.message),
        });
}

export type ReactionSelector =
    | { readonly emoji: string; readonly customEmojiId?: never }
    | { readonly emoji?: never; readonly customEmojiId: string };
