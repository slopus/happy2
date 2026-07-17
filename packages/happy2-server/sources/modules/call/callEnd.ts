import { type CallSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { callEvents, callParticipants, calls } from "../schema.js";

import { chatHint } from "../chat/chatHint.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { getCallProjectionDb } from "./impl/getCallProjectionDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Ends an active calls session, closes its remaining callParticipants, and appends the terminal callEvents history.
 * Committing those records with the chat sync change prevents a call from appearing ended while participants remain durably active.
 */
export async function callEnd(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        callId: string;
        reason?: string;
    },
): Promise<{
    call: CallSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const call = await getCallProjectionDb(tx, input.actorUserId, input.callId);
        if (!call) throw new CollaborationError("not_found", "Call was not found");
        const access = await chatGetAccess(tx, input.actorUserId, call.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Call was not found");
        if (
            call.createdByUserId !== input.actorUserId &&
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.membershipRole !== "admin"
        )
            throw new CollaborationError("forbidden", "Cannot end this call");
        if (!["ringing", "active"].includes(call.status))
            throw new CollaborationError("conflict", "Call has already ended");
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            call.chatId,
            "call.ended",
            input.callId,
        );
        await tx
            .update(calls)
            .set({
                status: "ended",
                endedAt: sql`CURRENT_TIMESTAMP`,
                endReason: input.reason ?? "ended",
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(calls.id, input.callId));
        await tx
            .update(callParticipants)
            .set({
                status: sql`case when ${callParticipants.status} in ('ringing', 'invited') then 'missed' when ${callParticipants.status} = 'joined' then 'left' else ${callParticipants.status} end`,
                leftAt: sql`case when ${callParticipants.status} in ('ringing', 'invited', 'joined') then CURRENT_TIMESTAMP else ${callParticipants.leftAt} end`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(callParticipants.callId, input.callId));
        await tx.insert(callEvents).values({
            id: createId(),
            callId: input.callId,
            kind: "ended",
            actorUserId: input.actorUserId,
            payloadJson: JSON.stringify({
                reason: input.reason ?? "ended",
            }),
        });
        const updated = await getCallProjectionDb(tx, input.actorUserId, input.callId);
        if (!updated) throw new Error("Ended call is not readable");
        return {
            call: updated,
            hint: {
                ...chatHint(sequence, call.chatId, mutation.pts),
                areas: ["calls"],
            },
        };
    });
}
