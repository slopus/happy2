import type { StoreWriter } from "../../kernel/store.js";
import type { ComposerInput, ComposerSnapshot } from "./composerTypes.js";

/** Applies owner-only authoritative composer input without re-emitting public output. */
export function composerInputApply(
    writer: StoreWriter<ComposerSnapshot>,
    event: ComposerInput,
): void {
    writer.update((snapshot) => {
        switch (event.type) {
            case "textReconciled":
                return snapshot.text === event.text
                    ? snapshot
                    : {
                          ...snapshot,
                          text: event.text,
                          revision: snapshot.revision + 1,
                          submission: { status: "idle" },
                      };
            case "submissionConfirmed":
                return snapshot.submission.status === "pending" &&
                    snapshot.submission.revision === event.revision &&
                    snapshot.revision === event.revision
                    ? { ...snapshot, text: "", attachments: [], submission: { status: "idle" } }
                    : snapshot;
            case "submissionFailed":
                return snapshot.submission.status === "pending" &&
                    snapshot.submission.revision === event.revision &&
                    snapshot.revision === event.revision
                    ? {
                          ...snapshot,
                          submission: {
                              status: "failed",
                              revision: event.revision,
                              error: event.error,
                          },
                      }
                    : snapshot;
        }
    });
}
