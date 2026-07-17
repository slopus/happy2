import type { ComposerStoreBinding } from "../composer/composerStore.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { ChatStoreBinding } from "../chat/chatStore.js";

export interface MessageActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStoreBinding | undefined;
    chatPinsReconcile(chatId: string): void;
    composerGet(scopeId: string): ComposerStoreBinding | undefined;
}
