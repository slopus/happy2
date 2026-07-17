import { type DrizzleExecutor } from "../drizzle.js";
import { type MessageSummary, type MutationHint } from "../chat/types.js";

import { finishAgentTurn } from "./impl/finishAgentTurn.js";
/**
 * Completes a running agent turn only for its current worker, publishing or updating the final assistant message and all chat projections.
 * Fixing the terminal status and completion event at this boundary keeps successful runs distinct from the failure reply path while sharing lease-safe finalization.
 */
export async function agentTurnComplete(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        actorUserId: string;
        sessionId: string;
        userMessageId: string;
        text: string;
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
        ...input,
        eventKind: "message.completed",
        status: "complete",
    });
}
