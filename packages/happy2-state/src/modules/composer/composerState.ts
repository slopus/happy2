import { createStore, type StoreApi } from "zustand/vanilla";
import { type MessageAudience, type UserError } from "../../types.js";

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
    /**
     * Who the next send addresses. Undefined means this surface does not route
     * audience and the server keeps its own default (agent conversations).
     */
    readonly audience?: MessageAudience;
    /** Additional agents explicitly selected beyond the chat's default agent. */
    readonly agentUserIds: readonly string[];
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
          readonly type: "audienceUpdated";
          readonly scopeId: string;
          readonly audience: MessageAudience;
      }
    | { readonly type: "agentUserAdded"; readonly scopeId: string; readonly agentUserId: string }
    | { readonly type: "agentUserRemoved"; readonly scopeId: string; readonly agentUserId: string }
    | {
          readonly type: "textSubmitted";
          readonly scopeId: string;
          readonly text: string;
          readonly attachments: readonly ComposerAttachment[];
          readonly revision: number;
          readonly audience?: MessageAudience;
          readonly agentUserIds: readonly string[];
      };

export type ComposerInput =
    | { readonly type: "textReconciled"; readonly text: string }
    | { readonly type: "agentUsersReconciled"; readonly agentUserIds: readonly string[] }
    | { readonly type: "submissionConfirmed"; readonly revision: number }
    | { readonly type: "submissionFailed"; readonly revision: number; readonly error: UserError };

export interface ComposerState extends ComposerSnapshot {
    textUpdate(text: string): void;
    attachmentAdd(attachment: ComposerAttachment): void;
    attachmentRemove(attachmentId: string): void;
    audienceUpdate(audience: MessageAudience): void;
    audienceToggle(): void;
    agentUserAdd(agentUserId: string): void;
    agentUserRemove(agentUserId: string): void;
    textSubmit(): void;
    composerInput(event: ComposerInput): void;
}

export type ComposerStore = StoreApi<ComposerState>;

export interface ComposerStoreOptions {
    readonly text?: string;
    readonly attachments?: readonly ComposerAttachment[];
    readonly audience?: MessageAudience;
    readonly agentUserIds?: readonly string[];
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
        audience: options.audience,
        agentUserIds: [...(options.agentUserIds ?? [])],

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

        audienceUpdate(audience): void {
            const previous = get();
            if (previous.audience === audience) return;
            set({ audience, revision: previous.revision + 1, submission: { status: "idle" } });
            output({ type: "audienceUpdated", scopeId, audience });
        },

        audienceToggle(): void {
            get().audienceUpdate(get().audience === "agents" ? "people" : "agents");
        },

        agentUserAdd(agentUserId): void {
            const previous = get();
            if (previous.agentUserIds.includes(agentUserId)) return;
            set({
                agentUserIds: [...previous.agentUserIds, agentUserId],
                revision: previous.revision + 1,
                submission: { status: "idle" },
            });
            output({ type: "agentUserAdded", scopeId, agentUserId });
        },

        agentUserRemove(agentUserId): void {
            const previous = get();
            if (!previous.agentUserIds.includes(agentUserId)) return;
            set({
                agentUserIds: previous.agentUserIds.filter((id) => id !== agentUserId),
                revision: previous.revision + 1,
                submission: { status: "idle" },
            });
            output({ type: "agentUserRemoved", scopeId, agentUserId });
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
                audience: previous.audience,
                agentUserIds: previous.audience === "agents" ? previous.agentUserIds : [],
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
                case "agentUsersReconciled": {
                    const allowed = new Set(event.agentUserIds);
                    const agentUserIds = snapshot.agentUserIds.filter((id) => allowed.has(id));
                    if (
                        agentUserIds.length === snapshot.agentUserIds.length &&
                        agentUserIds.every((id, index) => id === snapshot.agentUserIds[index])
                    )
                        return;
                    if (snapshot.submission.status === "pending") set({ agentUserIds });
                    else
                        set({
                            agentUserIds,
                            revision: snapshot.revision + 1,
                            submission: { status: "idle" },
                        });
                    return;
                }
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
