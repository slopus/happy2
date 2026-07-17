import type { ComposerStoreBinding } from "../composer/composerStore.js";

export interface DraftUpdated {
    readonly scopeId: string;
    readonly text: string;
}

export interface DraftActionContext {
    composerGet(scopeId: string): ComposerStoreBinding | undefined;
    draftUpdated(event: DraftUpdated): void;
}

/** Projects a draft into an existing composer and reports it to the injected outer coordinator. */
export function draftUpdate(context: DraftActionContext, scopeId: string, text: string): void {
    context.composerGet(scopeId)?.composerInput({ type: "textReconciled", text });
    context.draftUpdated({ scopeId, text });
}
