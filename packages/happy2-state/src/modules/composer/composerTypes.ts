import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { UserError } from "../../types.js";

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

export interface ComposerStore extends ReadonlyStore<ComposerSnapshot> {
    textUpdate(text: string): void;
    attachmentAdd(attachment: ComposerAttachment): void;
    attachmentRemove(attachmentId: string): void;
    textSubmit(): void;
}

export interface StandaloneComposerStore extends ComposerStore, Disposable {}
