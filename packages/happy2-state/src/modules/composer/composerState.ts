import { createStore, type StoreApi } from "zustand/vanilla";
import { type UserError } from "../../types.js";

export interface ComposerAttachment {
    readonly id: string;
    readonly name: string;
    readonly size: number;
}

export type ComposerSubmission =
    | { readonly status: "idle" }
    | { readonly status: "pending"; readonly revision: number }
    | { readonly status: "failed"; readonly revision: number; readonly error: UserError };

export interface ComposerSnapshot {
    readonly scopeId: string;
    readonly text: string;
    readonly attachments: readonly ComposerAttachment[];
    readonly revision: number;
    readonly submission: ComposerSubmission;
}

export type ComposerOutput =
    | { readonly type: "textUpdated"; readonly scopeId: string; readonly text: string }
    | {
          readonly type: "attachmentAdded";
          readonly scopeId: string;
          readonly attachment: ComposerAttachment;
      }
    | {
          readonly type: "attachmentRemoved";
          readonly scopeId: string;
          readonly attachmentId: string;
      }
    | {
          readonly type: "textSubmitted";
          readonly scopeId: string;
          readonly text: string;
          readonly attachments: readonly ComposerAttachment[];
          readonly revision: number;
      };

export type ComposerInput =
    | { readonly type: "textReconciled"; readonly text: string }
    | { readonly type: "submissionConfirmed"; readonly revision: number }
    | { readonly type: "submissionFailed"; readonly revision: number; readonly error: UserError };

export interface ComposerState extends ComposerSnapshot {
    textUpdate(text: string): void;
    attachmentAdd(attachment: ComposerAttachment): void;
    attachmentRemove(attachmentId: string): void;
    textSubmit(): void;
    composerInput(event: ComposerInput): void;
}

export type ComposerStore = StoreApi<ComposerState>;

export interface ComposerStoreOptions {
    readonly text?: string;
    readonly attachments?: readonly ComposerAttachment[];
    readonly output?: (event: ComposerOutput) => void;
}

/** Creates one self-contained composer store; every local mutation updates first and then emits. */
export function composerStoreCreate(
    scopeId: string,
    options: ComposerStoreOptions = {},
): ComposerStore {
    const output = options.output ?? (() => undefined);
    return createStore<ComposerState>()((set, get) => ({
        scopeId,
        text: options.text ?? "",
        attachments: options.attachments?.map((attachment) => ({ ...attachment })) ?? [],
        revision: 0,
        submission: { status: "idle" },

        textUpdate(text): void {
            const previous = get();
            if (previous.text === text) return;
            set({ text, revision: previous.revision + 1, submission: { status: "idle" } });
            output({ type: "textUpdated", scopeId, text });
        },

        attachmentAdd(attachment): void {
            const previous = get();
            if (previous.attachments.some((item) => item.id === attachment.id)) return;
            const storedAttachment = { ...attachment };
            set({
                attachments: [...previous.attachments, storedAttachment],
                revision: previous.revision + 1,
                submission: { status: "idle" },
            });
            output({ type: "attachmentAdded", scopeId, attachment: storedAttachment });
        },

        attachmentRemove(attachmentId): void {
            const previous = get();
            if (!previous.attachments.some((item) => item.id === attachmentId)) return;
            set({
                attachments: previous.attachments.filter((item) => item.id !== attachmentId),
                revision: previous.revision + 1,
                submission: { status: "idle" },
            });
            output({ type: "attachmentRemoved", scopeId, attachmentId });
        },

        textSubmit(): void {
            const previous = get();
            if (
                previous.submission.status === "pending" ||
                (previous.text.length === 0 && previous.attachments.length === 0)
            )
                return;
            set({ submission: { status: "pending", revision: previous.revision } });
            output({
                type: "textSubmitted",
                scopeId,
                text: previous.text,
                attachments: previous.attachments,
                revision: previous.revision,
            });
        },

        composerInput(event): void {
            const snapshot = get();
            switch (event.type) {
                case "textReconciled":
                    if (snapshot.text !== event.text)
                        set({
                            text: event.text,
                            revision: snapshot.revision + 1,
                            submission: { status: "idle" },
                        });
                    return;
                case "submissionConfirmed":
                    if (
                        snapshot.submission.status === "pending" &&
                        snapshot.submission.revision === event.revision &&
                        snapshot.revision === event.revision
                    )
                        set({ text: "", attachments: [], submission: { status: "idle" } });
                    return;
                case "submissionFailed":
                    if (
                        snapshot.submission.status === "pending" &&
                        snapshot.submission.revision === event.revision &&
                        snapshot.revision === event.revision
                    )
                        set({
                            submission: {
                                status: "failed",
                                revision: event.revision,
                                error: event.error,
                            },
                        });
            }
        },
    }));
}
