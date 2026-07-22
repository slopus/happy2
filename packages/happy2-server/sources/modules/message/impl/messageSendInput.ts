export interface MessageSendInput {
    actorUserId: string;
    chatId: string;
    text: string;
    attachmentFileIds?: string[];
    quotedMessageId?: string;
    expiresAt?: string;
    expiryMode?: "none" | "after_send" | "after_read";
    selfDestructSeconds?: number;
    afterReadScope?: "any_reader" | "all_readers";
    clientMutationId?: string;
    audience?: "people" | "agents";
    kind?: "user" | "automated";
    automated?: boolean;
    senderBotId?: string;
    forwardedFromMessageId?: string;
    agentSessionId?: string;
    agentTurns?: Array<{
        agentUserId: string;
        sessionId: string;
    }>;
}
