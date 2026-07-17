import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { ClientWorkspace, UserError } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";

export interface WorkspaceSnapshot {
    readonly chatId: string;
    readonly requestedDirectories: readonly string[];
    readonly status: Loadable<ClientWorkspace>;
}

export type WorkspaceOutput =
    | {
          readonly type: "directoriesUpdated";
          readonly chatId: string;
          readonly directories: readonly string[];
      }
    | {
          readonly type: "directoryMoreRequested";
          readonly chatId: string;
          readonly directory: string;
      };

export type WorkspaceInput =
    | { readonly type: "workspaceLoading" }
    | { readonly type: "workspaceLoaded"; readonly workspace: ClientWorkspace }
    | { readonly type: "workspaceFailed"; readonly error: UserError };

export interface WorkspaceStore extends ReadonlyStore<WorkspaceSnapshot> {
    directoriesUpdate(directories: readonly string[]): void;
    directoryMore(directory: string): void;
}

export interface WorkspaceHandle extends WorkspaceStore, Disposable {}
