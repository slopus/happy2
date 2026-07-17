export function agentReplyMutationId(sessionId: string, userMessageId: string): string {
    return `rig:${sessionId}:${userMessageId}`;
}
