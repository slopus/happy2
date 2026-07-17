import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { userError } from "../runtime/stateRuntime.js";
import type { ChatStoreBinding } from "./chatStore.js";

export interface ReactionActorsLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStoreBinding | undefined;
}

/** Loads reaction actors only after a retained hover/details request on an existing chat. */
export async function reactionActorsLoad(
    context: ReactionActorsLoadContext,
    chatId: string,
    messageId: string,
    reactionKey: string,
): Promise<void> {
    if (!context.chatGet(chatId) || !context.runtime.connected) return;
    try {
        const [messageResult, membersResult] = await Promise.all([
            context.runtime.operation("getMessage", { messageId }),
            context.runtime.operation("getChatMembers", { chatId }),
        ]);
        const reaction = messageResult.message.reactions.find((item) => item.key === reactionKey);
        const actorIds = new Set(reaction?.userIds ?? []);
        const actors = membersResult.users
            .filter((user) => actorIds.has(user.id))
            .map((user) => context.identities.project(user));
        context.chatGet(chatId)?.chatInput({
            type: "reactionActorsLoaded",
            details: { messageId, reactionKey, actors },
        });
    } catch (error) {
        context.chatGet(chatId)?.chatInput({
            type: "reactionActorsFailed",
            messageId,
            reactionKey,
            error: userError(error),
        });
    }
}
