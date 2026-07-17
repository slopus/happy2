import { type DrizzleExecutor } from "../drizzle.js";
import { type MessageSummary, type MutationHint } from "../chat/types.js";

import { finishAgentTurn } from "./impl/finishAgentTurn.js";
/**
 * Fails a running agent turn only for its current worker, retaining the error and publishing the standard failure reply with terminal chat projections.
 * Fixing the failed status, event kind, and user-visible text here prevents worker callers from reporting an inconsistent terminal outcome.
 */
export async function agentTurnFail(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        actorUserId: string;
        error: string;
        sessionId: string;
        userMessageId: string;
        workerId: string;
    },
): Promise<
    | {
          message: MessageSummary;
          hint: MutationHint;
      }
    | undefined
> {
    return finishAgentTurn(executor, {
        agentUserId: input.agentUserId,
        actorUserId: input.actorUserId,
        eventKind: "message.failed",
        lastError: input.error,
        sessionId: input.sessionId,
        status: "failed",
        text: "I couldn't complete this request.",
        userMessageId: input.userMessageId,
        workerId: input.workerId,
    });
}
