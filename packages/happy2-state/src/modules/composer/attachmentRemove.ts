import type { ComposerActionContext } from "./composerActionContext.js";

/** Removes one local attachment synchronously, then reports the typed user intent to its owner. */
export function attachmentRemove(context: ComposerActionContext, attachmentId: string): void {
    const previous = context.snapshotGet();
    if (!previous.attachments.some((item) => item.id === attachmentId)) return;
    context.snapshotUpdate((snapshot) => ({
        ...snapshot,
        attachments: snapshot.attachments.filter((item) => item.id !== attachmentId),
        revision: snapshot.revision + 1,
        submission: { status: "idle" },
    }));
    context.output({ type: "attachmentRemoved", scopeId: context.scopeId, attachmentId });
}
