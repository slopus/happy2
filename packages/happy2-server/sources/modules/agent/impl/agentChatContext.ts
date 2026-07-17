import { type AgentExecutionImage } from "./agentExecutionImage.js";
export interface AgentChatContext {
    agentUserId: string;
    agentEffort?: string;
    chatId: string;
    image: AgentExecutionImage;
    privateUserId: string;
    binding?: {
        containerName: string;
        cwd: string;
        sessionId: string;
    };
}
