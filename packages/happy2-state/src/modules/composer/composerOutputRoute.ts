import type { DraftActionContext } from "../draft/draftUpdate.js";
import { draftUpdate } from "../draft/draftUpdate.js";
import type { ComposerOutput } from "./composerTypes.js";

export interface ComposerOutputContext extends DraftActionContext {
    composerOutput(event: ComposerOutput): void;
    messageSend(
        chatId: string,
        input: { readonly text: string; readonly attachmentFileIds: readonly string[] },
        composerRevision: number,
    ): void;
}

/** Routes local composer intent without putting product branches on the HappyState registry shell. */
export function composerOutputRoute(context: ComposerOutputContext, event: ComposerOutput): void {
    if (event.type === "textUpdated") {
        draftUpdate(context, event.scopeId, event.text);
    } else if (event.type === "textSubmitted") {
        context.messageSend(
            event.scopeId,
            {
                text: event.text,
                attachmentFileIds: event.attachments.map((attachment) => attachment.id),
            },
            event.revision,
        );
    }
    context.composerOutput(event);
}
