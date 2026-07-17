import type { ComposerActionContext } from "./composerActionContext.js";

/** Updates the local draft text synchronously, then reports the typed user intent to its owner. */
export function textUpdate(context: ComposerActionContext, text: string): void {
    const previous = context.snapshotGet();
    if (previous.text === text) return;
    context.snapshotUpdate((snapshot) => ({
        ...snapshot,
        text,
        revision: snapshot.revision + 1,
        submission: { status: "idle" },
    }));
    context.output({ type: "textUpdated", scopeId: context.scopeId, text });
}
