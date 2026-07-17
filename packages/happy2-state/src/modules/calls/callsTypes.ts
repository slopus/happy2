import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { CallSummary, UserError, WebRtcSignal } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";
import type { IdentityProjection } from "../identity/identityTypes.js";

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
export interface CallsStore extends ReadonlyStore<CallsSnapshot> {
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
}
