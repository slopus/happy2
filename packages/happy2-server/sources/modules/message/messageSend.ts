import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MessageSummary, type MutationHint } from "../chat/types.js";

import { type MessageSendInput } from "./impl/messageSendInput.js";
import { messageSendInTransaction } from "./messageSendInTransaction.js";

/**
 * Publishes a message and every dependent chat, search, delivery, audit, and agent-turn record atomically.
 * This wrapper owns the retryable transaction while the in-transaction action remains composable for larger mutations.
 */
export async function messageSend(
    executor: DrizzleExecutor,
    input: MessageSendInput,
): Promise<{
    message: MessageSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, (tx) => messageSendInTransaction(tx, input));
}
