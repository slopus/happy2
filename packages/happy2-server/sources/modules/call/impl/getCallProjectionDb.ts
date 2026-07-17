import { type CallSummary } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { and, eq } from "drizzle-orm";
import { callParticipants, calls } from "../../schema.js";

import { chatGetAccess } from "../../chat/chatGetAccess.js";
/**
 * Builds a call projection only for a viewer who can access its chat and has a callParticipants row, ordering participants by invitation.
 * Combining chat and call membership prevents either relationship alone from exposing private call state.
 */
export async function getCallProjectionDb(
    executor: DrizzleExecutor,
    viewerUserId: string,
    callId: string,
): Promise<CallSummary | undefined> {
    const [row] = await executor
        .select({
            id: calls.id,
            chatId: calls.chatId,
            createdByUserId: calls.createdByUserId,
            kind: calls.kind,
            status: calls.status,
            startedAt: calls.startedAt,
            endedAt: calls.endedAt,
            endReason: calls.endReason,
            createdAt: calls.createdAt,
            updatedAt: calls.updatedAt,
        })
        .from(calls)
        .where(eq(calls.id, callId))
        .limit(1);
    if (!row || !(await chatGetAccess(executor, viewerUserId, row.chatId, false))) return undefined;
    const [visible] = await executor
        .select({
            userId: callParticipants.userId,
        })
        .from(callParticipants)
        .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, viewerUserId)))
        .limit(1);
    if (!visible) return undefined;
    const participants = await executor
        .select({
            userId: callParticipants.userId,
            status: callParticipants.status,
            joinedAt: callParticipants.joinedAt,
            leftAt: callParticipants.leftAt,
        })
        .from(callParticipants)
        .where(eq(callParticipants.callId, callId))
        .orderBy(callParticipants.invitedAt, callParticipants.userId);
    return {
        id: row.id,
        chatId: row.chatId,
        createdByUserId: row.createdByUserId ?? undefined,
        kind: row.kind as CallSummary["kind"],
        status: row.status as CallSummary["status"],
        participants: participants.map((p) => ({
            userId: p.userId,
            status: p.status as CallSummary["participants"][number]["status"],
            joinedAt: p.joinedAt ?? undefined,
            leftAt: p.leftAt ?? undefined,
        })),
        startedAt: row.startedAt ?? undefined,
        endedAt: row.endedAt ?? undefined,
        endReason: row.endReason ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
