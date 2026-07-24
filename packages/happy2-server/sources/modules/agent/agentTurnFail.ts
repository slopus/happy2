import { type DrizzleExecutor } from "../drizzle.js";
import { type MessageSummary, type MutationHint } from "../chat/types.js";

import { finishAgentTurn } from "./impl/finishAgentTurn.js";

const MAX_DISPLAY_ERROR_CHARACTERS = 1_000;

/**
 * Fails a running agent turn only for its current worker, retaining the full error and publishing a bounded user-visible failure with terminal chat projections.
 * Fixing the failed status, event kind, and diagnostic reply here prevents worker callers from hiding or reporting an inconsistent terminal outcome.
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
        text: `I couldn't complete this request.\n\nError: ${displayError(input.error)}`,
        userMessageId: input.userMessageId,
        workerId: input.workerId,
    });
}

function displayError(error: string): string {
    const normalized = error.replaceAll("\0", "").replace(/\s+/gu, " ").trim();
    if (!normalized) return "Unknown agent error.";
    if (normalized.length <= MAX_DISPLAY_ERROR_CHARACTERS) return normalized;
    return `${normalized.slice(0, MAX_DISPLAY_ERROR_CHARACTERS - 1)}…`;
}
