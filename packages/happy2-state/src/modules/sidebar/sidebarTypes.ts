import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { ChatSummary, SyncState, UserError } from "../../types.js";
import type { IdentityProjection } from "../identity/identityTypes.js";

export type SidebarStatus =
    | { readonly type: "unloaded" }
    | { readonly type: "loading" }
    | { readonly type: "ready" }
    | { readonly type: "error"; readonly error: UserError };

export interface SidebarChatProjection {
    readonly chat: ChatSummary;
    readonly id: string;
    readonly displayName: string;
    readonly avatarFileId?: string;
    readonly participants: readonly IdentityProjection[];
}

export interface SidebarSnapshot {
    readonly status: SidebarStatus;
    readonly chats: readonly SidebarChatProjection[];
    readonly sync?: SyncState;
}

export type SidebarInput =
    | { readonly type: "sidebarLoading" }
    | {
          readonly type: "sidebarLoaded";
          readonly chats: readonly SidebarChatProjection[];
          readonly sync: SyncState;
      }
    | { readonly type: "sidebarFailed"; readonly error: UserError }
    | {
          readonly type: "chatSummariesReconciled";
          readonly changedChats: readonly SidebarChatProjection[];
          readonly removedChatIds: readonly string[];
          readonly sync: SyncState;
      }
    | { readonly type: "chatSummaryUpserted"; readonly chat: SidebarChatProjection }
    | { readonly type: "chatSummaryRemoved"; readonly chatId: string };

export interface SidebarStore extends ReadonlyStore<SidebarSnapshot> {}
