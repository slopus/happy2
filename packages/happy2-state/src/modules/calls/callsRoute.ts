import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { CallsStoreBinding } from "./callsStore.js";
import type { CallsOutput } from "./callsTypes.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { CallSummary } from "../../types.js";

export interface CallsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly calls: CallsStoreBinding;
}
const generations = new WeakMap<CallsStoreBinding, number>();

/** Loads active/recent calls for the mounted calls surface. */
export async function callsLoad(context: CallsActionContext): Promise<void> {
    const generation = (generations.get(context.calls) ?? 0) + 1;
    generations.set(context.calls, generation);
    context.calls.callsInput({ type: "callsLoading" });
    try {
        const result = await context.runtime.operation("getCalls", { limit: 100 });
        if (generations.get(context.calls) !== generation) return;
        const userIds = new Set(
            result.calls.flatMap((call) => [
                ...(call.createdByUserId ? [call.createdByUserId] : []),
                ...call.participants.map((participant) => participant.userId),
            ]),
        );
        if ([...userIds].some((userId) => !context.identities.get(userId))) {
            const contacts = await context.runtime.operation("getContacts").catch(() => undefined);
            if (generations.get(context.calls) !== generation) return;
            for (const user of contacts?.users ?? []) context.identities.project(user);
        }
        context.calls.callsInput({
            type: "callsLoaded",
            calls: result.calls.map((call) => callProject(context.identities, call)),
        });
    } catch (error) {
        if (generations.get(context.calls) === generation)
            context.calls.callsInput({ type: "callsFailed", error: userError(error) });
    }
}
/** Executes one typed call lifecycle intent and projects its authoritative call response. */
export async function callsOutputRoute(
    context: CallsActionContext,
    event: CallsOutput,
): Promise<void> {
    try {
        if (event.type === "callSignalSubmitted") {
            await context.runtime.operation("sendCallSignal", {
                callId: event.callId,
                chatId: event.chatId,
                recipientUserId: event.recipientUserId,
                signal: event.signal,
            });
            return;
        }
        if (event.type === "callCreateSubmitted")
            await context.runtime.operation("createCall", {
                chatId: event.chatId,
                kind: event.kind,
                invitedUserIds: event.invitedUserIds,
            });
        else if (event.type === "callJoinSubmitted")
            await context.runtime.operation("joinCall", { callId: event.callId });
        else if (event.type === "callDeclineSubmitted")
            await context.runtime.operation("declineCall", { callId: event.callId });
        else if (event.type === "callLeaveSubmitted")
            await context.runtime.operation("leaveCall", { callId: event.callId });
        else await context.runtime.operation("endCall", { callId: event.callId });
        await callsLoad(context);
    } catch (error) {
        context.calls.callsInput({ type: "callActionFailed", error: userError(error) });
    }
}

function callProject(identities: IdentityCatalog, call: CallSummary) {
    return {
        id: call.id,
        chatId: call.chatId,
        createdByUserId: call.createdByUserId,
        kind: call.kind,
        status: call.status,
        ...(call.createdByUserId ? { createdBy: identities.get(call.createdByUserId) } : {}),
        participants: call.participants.map((participant) => ({
            userId: participant.userId,
            status: participant.status,
            joinedAt: participant.joinedAt,
            leftAt: participant.leftAt,
            identity: identities.get(participant.userId),
        })),
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        endReason: call.endReason,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt,
    };
}
