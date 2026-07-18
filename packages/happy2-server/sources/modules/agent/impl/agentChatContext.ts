import { type AgentExecutionImage } from "./agentExecutionImage.js";
export interface AgentChatContext {
    agentUserId: string;
    agentEffort?: string;
    chatId: string;
    image: AgentExecutionImage;
    sandboxScope: {
        kind: "users" | "chats";
        id: string;
        conversationId?: string;
    };
    binding?: {
        containerName: string;
        cwd: string;
        sessionId: string;
    };
}
