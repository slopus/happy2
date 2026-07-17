import { storeCreate } from "../../kernel/store.js";
import type { CallsInput, CallsOutput, CallsSnapshot, CallsStore } from "./callsTypes.js";

export interface CallsStoreBinding {
    readonly store: CallsStore;
    callsInput(event: CallsInput): void;
    dispose(): void;
}
/** Creates one calls surface with bounded per-call ephemeral signalling state. */
export function callsStoreCreateBinding(
    output: (event: CallsOutput) => void = () => undefined,
): CallsStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<CallsSnapshot>({
        calls: { type: "unloaded" },
        signalsByCall: {},
    });
    let disposed = false;
    const submit = (event: CallsOutput): void => {
        if (disposed) return;
        writer.update((snapshot) =>
            snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
        );
        output(event);
    };
    return {
        store: {
            ...readonlyStore,
            callCreate(chatId, kind, invitedUserIds): void {
                submit({ type: "callCreateSubmitted", chatId, kind, invitedUserIds });
            },
            callJoin(callId): void {
                submit({ type: "callJoinSubmitted", callId });
            },
            callDecline(callId): void {
                submit({ type: "callDeclineSubmitted", callId });
            },
            callLeave(callId): void {
                submit({ type: "callLeaveSubmitted", callId });
            },
            callEnd(callId): void {
                submit({ type: "callEndSubmitted", callId });
            },
            callSignalSend(callId, chatId, recipientUserId, signal): void {
                submit({
                    type: "callSignalSubmitted",
                    callId,
                    chatId,
                    recipientUserId,
                    signal,
                });
            },
        },
        callsInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.type === "callsLoading")
                    return { ...snapshot, calls: { type: "loading" } };
                if (event.type === "callsFailed")
                    return { ...snapshot, calls: { type: "error", error: event.error } };
                if (event.type === "callsLoaded") {
                    return {
                        ...snapshot,
                        calls: { type: "ready", value: event.calls },
                    };
                }
                if (event.type === "callActionFailed")
                    return { ...snapshot, actionError: event.error };
                if (event.type === "callSignalReceived") {
                    const current = snapshot.signalsByCall[event.signal.callId] ?? [];
                    const next = [...current, event.signal].slice(-64);
                    return {
                        ...snapshot,
                        signalsByCall: { ...snapshot.signalsByCall, [event.signal.callId]: next },
                    };
                }
                return snapshot;
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
