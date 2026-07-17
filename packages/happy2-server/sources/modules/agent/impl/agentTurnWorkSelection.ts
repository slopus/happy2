import { agentTurns, messages } from "../../schema.js";

export const agentTurnWorkSelection = {
    agentUserId: agentTurns.agentUserId,
    actorUserId: messages.senderUserId,
    baselineMessageCount: agentTurns.baselineMessageCount,
    chatId: agentTurns.chatId,
    lastSessionEventId: agentTurns.lastSessionEventId,
    runId: agentTurns.runId,
    sessionId: agentTurns.sessionId,
    leaseExpiresAt: agentTurns.leaseExpiresAt,
    startedAt: agentTurns.startedAt,
    workerId: agentTurns.workerId,
    text: messages.text,
    streamCommittedText: agentTurns.streamCommittedText,
    userMessageId: agentTurns.userMessageId,
};
