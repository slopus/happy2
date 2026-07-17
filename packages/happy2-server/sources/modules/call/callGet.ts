import { type CallSummary, CollaborationError } from "../chat/types.js";

import { type DrizzleExecutor } from "../drizzle.js";
import { getCallProjectionDb } from "./impl/getCallProjectionDb.js";
/**
 * Returns a call and its invitation-ordered participants only when the viewer can access the chat and is recorded as a call participant.
 * Translating every missing or inaccessible projection to not-found prevents callers from distinguishing private calls by identifier.
 */
export async function callGet(
    executor: DrizzleExecutor,
    userId: string,
    callId: string,
): Promise<CallSummary> {
    const call = await getCallProjectionDb(executor, userId, callId);
    if (!call) throw new CollaborationError("not_found", "Call was not found");
    return call;
}
