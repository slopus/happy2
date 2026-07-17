import type { ComposerActionContext } from "./composerActionContext.js";
import type { ComposerAttachment } from "./composerTypes.js";

/** Adds one unique local attachment synchronously, then reports the typed user intent to its owner. */
export function attachmentAdd(
    context: ComposerActionContext,
    attachment: ComposerAttachment,
): void {
    const previous = context.snapshotGet();
    if (previous.attachments.some((item) => item.id === attachment.id)) return;
    const storedAttachment = { ...attachment };
    context.snapshotUpdate((snapshot) => ({
        ...snapshot,
        attachments: [...snapshot.attachments, storedAttachment],
        revision: snapshot.revision + 1,
        submission: { status: "idle" },
    }));
    context.output({
        type: "attachmentAdded",
        scopeId: context.scopeId,
        attachment: storedAttachment,
    });
}
