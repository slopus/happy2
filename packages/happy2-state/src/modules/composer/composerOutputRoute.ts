import type { DraftActionContext } from "../draft/draftUpdate.js";
import { draftUpdate } from "../draft/draftUpdate.js";
import type { ComposerOutput } from "./composerTypes.js";

export interface ComposerOutputContext extends DraftActionContext {
    composerOutput(event: ComposerOutput): void;
}

/** Routes local composer intent without putting product branches on the HappyState registry shell. */
export function composerOutputRoute(context: ComposerOutputContext, event: ComposerOutput): void {
    if (event.type === "textUpdated") {
        draftUpdate(context, event.scopeId, event.text);
    }
    context.composerOutput(event);
}
