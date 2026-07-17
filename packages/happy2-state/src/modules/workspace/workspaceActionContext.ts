import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { WorkspaceStoreBinding } from "./workspaceStore.js";

export interface WorkspaceActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    workspaceGet(chatId: string): WorkspaceStoreBinding | undefined;
}
