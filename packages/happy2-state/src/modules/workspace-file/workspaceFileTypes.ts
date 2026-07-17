import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { UserError, WorkspaceTextFile } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";

export type WorkspaceFileSaveState =
    | { readonly type: "clean" }
    | { readonly type: "dirty" }
    | { readonly type: "saving" }
    | { readonly type: "error"; readonly error: UserError }
    | {
          readonly type: "conflict";
          readonly error: UserError;
          readonly currentFile?: WorkspaceTextFile;
      };

export interface WorkspaceFileSnapshot {
    readonly chatId: string;
    readonly path: string;
    readonly file: Loadable<WorkspaceTextFile>;
    readonly content: string;
    readonly saveState: WorkspaceFileSaveState;
}

export type WorkspaceFileOutput =
    | { readonly type: "contentSaveRequested"; readonly chatId: string; readonly path: string }
    | { readonly type: "fileDeleteRequested"; readonly chatId: string; readonly path: string };

export type WorkspaceFileInput =
    | { readonly type: "fileLoading" }
    | { readonly type: "fileLoaded"; readonly file: WorkspaceTextFile }
    | { readonly type: "fileLoadFailed"; readonly error: UserError }
    | { readonly type: "contentSaving" }
    | {
          readonly type: "contentSaved";
          readonly file: WorkspaceTextFile;
          readonly submittedContent: string;
      }
    | { readonly type: "contentSaveFailed"; readonly error: UserError }
    | {
          readonly type: "contentConflict";
          readonly error: UserError;
          readonly currentFile?: WorkspaceTextFile;
      }
    | { readonly type: "fileDeleted" };

export interface WorkspaceFileStore extends ReadonlyStore<WorkspaceFileSnapshot> {
    contentUpdate(content: string): void;
    contentSave(): void;
    fileDelete(): void;
}

export interface WorkspaceFileHandle extends WorkspaceFileStore, Disposable {}
