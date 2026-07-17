import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { FileSummary, UserError } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";

export interface FilesSnapshot {
    readonly status: Loadable<true>;
    readonly files: readonly FileSummary[];
    readonly nextCursor?: string;
    readonly loadingMore: boolean;
    readonly pageError?: UserError;
}

export type FilesOutput = { readonly type: "filesMoreRequested" };

export type FilesInput =
    | { readonly type: "filesLoading" }
    | {
          readonly type: "filesLoaded";
          readonly files: readonly FileSummary[];
          readonly nextCursor?: string;
          readonly append: boolean;
      }
    | { readonly type: "filesFailed"; readonly error: UserError }
    | { readonly type: "filesPageFailed"; readonly error: UserError };

export interface FilesStore extends ReadonlyStore<FilesSnapshot> {
    filesMore(): void;
}
