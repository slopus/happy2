import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { ChatSummary, PresenceSettingsSummary, PresenceSnapshot } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";
import type { IdentityProjection } from "../identity/identityTypes.js";

export interface DirectoryUserProjection extends IdentityProjection {
    readonly title?: string;
    readonly role: "member" | "admin";
    readonly presence: PresenceSnapshot["status"];
    readonly availability?: PresenceSettingsSummary["availability"];
    readonly customStatusText?: string;
    readonly customStatusEmoji?: string;
}

export interface DirectorySnapshot {
    readonly status: Loadable<true>;
    readonly users: readonly DirectoryUserProjection[];
    readonly channels: readonly ChatSummary[];
}

export type DirectoryInput =
    | { readonly type: "directoryLoading" }
    | {
          readonly type: "directoryLoaded";
          readonly users: readonly DirectoryUserProjection[];
          readonly channels: readonly ChatSummary[];
      }
    | { readonly type: "directoryFailed"; readonly error: import("../../types.js").UserError }
    | {
          readonly type: "presenceReconciled";
          readonly userId: string;
          readonly presence: PresenceSnapshot["status"];
      };

export interface DirectoryStore extends ReadonlyStore<DirectorySnapshot> {}
