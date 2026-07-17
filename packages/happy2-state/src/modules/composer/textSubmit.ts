import type { ComposerActionContext } from "./composerActionContext.js";

/** Marks a non-empty draft pending synchronously, then reports its immutable submit payload. */
export function textSubmit(context: ComposerActionContext): void {
    const previous = context.snapshotGet();
    if (
        previous.submission.status === "pending" ||
        (previous.text.length === 0 && previous.attachments.length === 0)
    ) {
        return;
    }
    context.snapshotUpdate((snapshot) => ({
        ...snapshot,
        submission: { status: "pending", revision: snapshot.revision },
    }));
    context.output({
        type: "textSubmitted",
        scopeId: context.scopeId,
        text: previous.text,
        attachments: previous.attachments,
        revision: previous.revision,
    });
}
