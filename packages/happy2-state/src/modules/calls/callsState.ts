import { createStore, type StoreApi } from "zustand/vanilla";
import { type CallSummary, type UserError, type WebRtcSignal } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface CallsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly calls: CallsStore;
}

const generations = new WeakMap<CallsStore, number>();

/** Loads active/recent calls for the mounted calls surface. */
export async function callsLoad(context: CallsActionContext): Promise<void> {
    const generation = (generations.get(context.calls) ?? 0) + 1;
    generations.set(context.calls, generation);
    context.calls.getState().callsInput({ type: "callsLoading" });
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
        context.calls.getState().callsInput({
            type: "callsLoaded",
            calls: result.calls.map((call) => callProject(context.identities, call)),
        });
    } catch (error) {
        if (generations.get(context.calls) === generation)
            context.calls.getState().callsInput({ type: "callsFailed", error: userError(error) });
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
        context.calls.getState().callsInput({ type: "callActionFailed", error: userError(error) });
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

/** Creates one calls surface with bounded per-call ephemeral signalling state. */
export function callsStoreCreate(
    output: (event: CallsOutput) => void = () => undefined,
): CallsStore {
    return createStore<CallsState>()((set) => {
        const submit = (event: CallsOutput): void => {
            set((snapshot) =>
                snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
            );
            output(event);
        };
        return {
            calls: { type: "unloaded" },
            signalsByCall: {},
            callCreate: (chatId, kind, invitedUserIds) =>
                submit({ type: "callCreateSubmitted", chatId, kind, invitedUserIds }),
            callJoin: (callId) => submit({ type: "callJoinSubmitted", callId }),
            callDecline: (callId) => submit({ type: "callDeclineSubmitted", callId }),
            callLeave: (callId) => submit({ type: "callLeaveSubmitted", callId }),
            callEnd: (callId) => submit({ type: "callEndSubmitted", callId }),
            callSignalSend: (callId, chatId, recipientUserId, signal) =>
                submit({ type: "callSignalSubmitted", callId, chatId, recipientUserId, signal }),
            callsInput(event): void {
                set((snapshot) => {
                    if (event.type === "callsLoading")
                        return { ...snapshot, calls: { type: "loading" } };
                    if (event.type === "callsFailed")
                        return { ...snapshot, calls: { type: "error", error: event.error } };
                    if (event.type === "callsLoaded")
                        return { ...snapshot, calls: { type: "ready", value: event.calls } };
                    if (event.type === "callActionFailed")
                        return { ...snapshot, actionError: event.error };
                    if (event.type === "callSignalReceived") {
                        const current = snapshot.signalsByCall[event.signal.callId] ?? [];
                        return {
                            ...snapshot,
                            signalsByCall: {
                                ...snapshot.signalsByCall,
                                [event.signal.callId]: [...current, event.signal].slice(-64),
                            },
                        };
                    }
                    return snapshot;
                });
            },
        };
    });
}

export interface CallParticipantProjection {
    readonly userId: string;
    readonly status: CallSummary["participants"][number]["status"];
    readonly joinedAt?: string;
    readonly leftAt?: string;
    readonly identity?: IdentityProjection;
}

export interface CallProjection {
    readonly id: string;
    readonly chatId: string;
    readonly createdByUserId?: string;
    readonly kind: CallSummary["kind"];
    readonly status: CallSummary["status"];
    readonly createdBy?: IdentityProjection;
    readonly participants: readonly CallParticipantProjection[];
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly endReason?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface CallSignalProjection {
    readonly callId: string;
    readonly senderUserId: string;
    readonly recipientUserId?: string;
    readonly signal: WebRtcSignal;
    readonly occurredAt: number;
}

export interface CallsSnapshot {
    readonly calls: Loadable<readonly CallProjection[]>;
    readonly signalsByCall: Readonly<Record<string, readonly CallSignalProjection[]>>;
    readonly actionError?: UserError;
}

export type CallsOutput =
    | {
          readonly type: "callCreateSubmitted";
          readonly chatId: string;
          readonly kind: "audio" | "video";
          readonly invitedUserIds?: readonly string[];
      }
    | { readonly type: "callJoinSubmitted"; readonly callId: string }
    | { readonly type: "callDeclineSubmitted"; readonly callId: string }
    | { readonly type: "callLeaveSubmitted"; readonly callId: string }
    | { readonly type: "callEndSubmitted"; readonly callId: string }
    | {
          readonly type: "callSignalSubmitted";
          readonly callId: string;
          readonly chatId: string;
          readonly recipientUserId: string;
          readonly signal: WebRtcSignal;
      };

export type CallsInput =
    | { readonly type: "callsLoading" }
    | {
          readonly type: "callsLoaded";
          readonly calls: readonly CallProjection[];
      }
    | { readonly type: "callsFailed"; readonly error: UserError }
    | { readonly type: "callSignalReceived"; readonly signal: CallSignalProjection }
    | { readonly type: "callActionFailed"; readonly error: UserError };

export interface CallsState extends CallsSnapshot {
    callCreate(chatId: string, kind: "audio" | "video", invitedUserIds?: readonly string[]): void;
    callJoin(callId: string): void;
    callDecline(callId: string): void;
    callLeave(callId: string): void;
    callEnd(callId: string): void;
    callSignalSend(
        callId: string,
        chatId: string,
        recipientUserId: string,
        signal: WebRtcSignal,
    ): void;
    callsInput(event: CallsInput): void;
}

export type CallsStore = StoreApi<CallsState>;
