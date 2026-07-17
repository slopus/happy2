import { type CallSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, sql } from "drizzle-orm";
import { callEvents, callParticipants, calls } from "../schema.js";

import { chatHint } from "../chat/chatHint.js";
import { createId } from "@paralleldrive/cuid2";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { getCallProjectionDb } from "./impl/getCallProjectionDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Applies a participant join, leave, decline, or state change to callParticipants and records the matching callEvents entry.
 * Updating calls lifecycle and synchronization in the same transaction preserves a coherent roster and event timeline for every listener.
 */
export async function callParticipationUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        callId: string;
        action: "join" | "decline" | "leave";
    },
): Promise<{
    call: CallSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const call = await getCallProjectionDb(tx, input.actorUserId, input.callId);
        if (!call) throw new CollaborationError("not_found", "Call was not found");
        if (call.status === "ended" || call.status === "cancelled" || call.status === "failed")
            throw new CollaborationError("conflict", "Call has ended");
        const [participant] = await tx
            .select({
                status: callParticipants.status,
            })
            .from(callParticipants)
            .where(
                and(
                    eq(callParticipants.callId, input.callId),
                    eq(callParticipants.userId, input.actorUserId),
                ),
            )
            .limit(1);
        if (!participant) throw new CollaborationError("not_found", "Call was not found");
        const nextStatus =
            input.action === "join" ? "joined" : input.action === "decline" ? "declined" : "left";
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            call.chatId,
            `call.${nextStatus}`,
            input.callId,
        );
        await tx
            .update(callParticipants)
            .set({
                status: nextStatus,
                joinedAt:
                    nextStatus === "joined"
                        ? sql`coalesce(${callParticipants.joinedAt}, CURRENT_TIMESTAMP)`
                        : sql`${callParticipants.joinedAt}`,
                leftAt: ["declined", "left"].includes(nextStatus)
                    ? sql`CURRENT_TIMESTAMP`
                    : sql`${callParticipants.leftAt}`,
                lastSeenAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(callParticipants.callId, input.callId),
                    eq(callParticipants.userId, input.actorUserId),
                ),
            );
        await tx.insert(callEvents).values({
            id: createId(),
            callId: input.callId,
            kind: nextStatus,
            actorUserId: input.actorUserId,
        });
        if (nextStatus === "joined")
            await tx
                .update(calls)
                .set({
                    status: "active",
                    startedAt: sql`coalesce(${calls.startedAt}, CURRENT_TIMESTAMP)`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(calls.id, input.callId));
        else {
            const [remaining] = await tx
                .select({
                    userId: callParticipants.userId,
                })
                .from(callParticipants)
                .where(
                    and(
                        eq(callParticipants.callId, input.callId),
                        inArray(callParticipants.status, ["joined", "ringing", "invited"]),
                    ),
                )
                .limit(1);
            if (!remaining)
                await tx
                    .update(calls)
                    .set({
                        status: "ended",
                        endedAt: sql`CURRENT_TIMESTAMP`,
                        endReason: "no_participants",
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(calls.id, input.callId));
        }
        const updated = await getCallProjectionDb(tx, input.actorUserId, input.callId);
        if (!updated) throw new Error("Updated call is not readable");
        return {
            call: updated,
            hint: {
                ...chatHint(sequence, call.chatId, mutation.pts),
                areas: ["calls"],
            },
        };
    });
}
