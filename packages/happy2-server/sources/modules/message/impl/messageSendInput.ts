export interface MessageSendInput {
    actorUserId: string;
    chatId: string;
    text: string;
    attachmentFileIds?: string[];
    quotedMessageId?: string;
    threadRootMessageId?: string;
    expiresAt?: string;
    expiryMode?: "none" | "after_send" | "after_read";
    selfDestructSeconds?: number;
    afterReadScope?: "any_reader" | "all_readers";
    clientMutationId?: string;
    kind?: "user" | "automated";
    senderBotId?: string;
    forwardedFromMessageId?: string;
    agentSessionId?: string;
    agentTurn?: {
        agentUserId: string;
        sessionId: string;
    };
}
