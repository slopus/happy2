import { type CallSummary, CollaborationError } from "../chat/types.js";

import { type DrizzleExecutor } from "../drizzle.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { callParticipants, calls } from "../schema.js";

import { chatGetAccess } from "../chat/chatGetAccess.js";
import { getCallProjectionDb } from "./impl/getCallProjectionDb.js";
/**
 * Lists a user's participated calls newest first, optionally within an accessible chat, and expands each through the participant projection.
 * Revalidating visibility during projection prevents stale participation rows from exposing calls after chat access changes.
 */
export async function callList(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        chatId?: string;
        limit: number;
    },
): Promise<CallSummary[]> {
    if (input.chatId && !(await chatGetAccess(executor, input.userId, input.chatId, false)))
        throw new CollaborationError("not_found", "Chat was not found");
    const visibleCalls = executor
        .select({
            callId: callParticipants.callId,
        })
        .from(callParticipants)
        .where(
            and(eq(callParticipants.callId, calls.id), eq(callParticipants.userId, input.userId)),
        );
    const result = await executor
        .select({
            id: calls.id,
        })
        .from(calls)
        .where(
            and(
                ...(input.chatId ? [eq(calls.chatId, input.chatId)] : []),
                sql`exists ${visibleCalls}`,
            ),
        )
        .orderBy(desc(calls.createdAt), desc(calls.id))
        .limit(input.limit);
    const callSummaries: CallSummary[] = [];
    for (const row of result) {
        const call = await getCallProjectionDb(executor, input.userId, row.id);
        if (call) callSummaries.push(call);
    }
    return callSummaries;
}
