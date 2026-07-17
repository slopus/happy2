import type { ChatOutput } from "./chatTypes.js";

export interface ChatOutputRouteContext {
    chatMembersLoad(chatId: string): void;
    chatPinsLoad(chatId: string): void;
    reactionActorsLoad(chatId: string, messageId: string, reactionKey: string): void;
    agentEffortLoad(chatId: string, agentUserId: string): void;
    agentEffortChange(chatId: string, agentUserId: string, effort: string): void;
}

/** Routes typed chat-local retention intent into owner-side loading actions. */
export function chatOutputRoute(context: ChatOutputRouteContext, event: ChatOutput): void {
    switch (event.type) {
        case "membersRetained":
            context.chatMembersLoad(event.chatId);
            return;
        case "pinsRetained":
            context.chatPinsLoad(event.chatId);
            return;
        case "reactionActorsRetained":
            context.reactionActorsLoad(event.chatId, event.messageId, event.reactionKey);
            return;
        case "agentEffortRetained":
            context.agentEffortLoad(event.chatId, event.agentUserId);
            return;
        case "agentEffortSubmitted":
            context.agentEffortChange(event.chatId, event.agentUserId, event.effort);
    }
}
