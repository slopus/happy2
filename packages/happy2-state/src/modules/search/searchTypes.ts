import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { FileSummary, UserError } from "../../types.js";
import type { IdentityProjection } from "../identity/identityTypes.js";
import type { ChatMessageProjection, Loadable } from "../chat/chatTypes.js";
import type { ChatSummary } from "../../types.js";

export type SearchResultProjection =
    | { readonly type: "message"; readonly score: number; readonly message: ChatMessageProjection }
    | { readonly type: "channel"; readonly score: number; readonly channel: ChatSummary }
    | { readonly type: "user"; readonly score: number; readonly user: IdentityProjection };

export interface SearchSnapshot {
    readonly query: string;
    readonly results: Loadable<readonly SearchResultProjection[]>;
    readonly files: readonly FileSummary[];
    readonly nextCursor?: string;
}

export type SearchOutput = { readonly type: "queryUpdated"; readonly query: string };

export type SearchInput =
    | { readonly type: "searchLoading"; readonly query: string }
    | {
          readonly type: "searchLoaded";
          readonly query: string;
          readonly results: readonly SearchResultProjection[];
          readonly files: readonly FileSummary[];
          readonly nextCursor?: string;
      }
    | { readonly type: "searchFailed"; readonly query: string; readonly error: UserError };

export interface SearchStore extends ReadonlyStore<SearchSnapshot> {
    queryUpdate(query: string): void;
}
