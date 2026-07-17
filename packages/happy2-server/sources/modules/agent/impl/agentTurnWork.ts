export function agentTurnWork(row: {
    agentUserId: string;
    actorUserId: string | null;
    baselineMessageCount: number | null;
    chatId: string;
    lastSessionEventId: string | null;
    leaseExpiresAt: string | null;
    runId: string | null;
    sessionId: string;
    startedAt: string | null;
    streamCommittedText: string;
    text: string;
    userMessageId: string;
    workerId: string | null;
}) {
    if (!row.actorUserId) throw new Error("Agent turn sender is missing");
    if (!row.workerId) throw new Error("Agent turn worker lease is missing");
    return {
        agentUserId: row.agentUserId,
        actorUserId: row.actorUserId,
        ...(row.baselineMessageCount === null
            ? {}
            : {
                  baselineMessageCount: row.baselineMessageCount,
              }),
        chatId: row.chatId,
        ...(row.lastSessionEventId
            ? {
                  lastSessionEventId: row.lastSessionEventId,
              }
            : {}),
        ...(row.leaseExpiresAt
            ? {
                  leaseExpiresAt: row.leaseExpiresAt,
              }
            : {}),
        ...(row.runId
            ? {
                  runId: row.runId,
              }
            : {}),
        sessionId: row.sessionId,
        startedAt: row.startedAt ?? new Date().toISOString(),
        streamCommittedText: row.streamCommittedText,
        text: row.text,
        userMessageId: row.userMessageId,
        workerId: row.workerId,
    };
}
