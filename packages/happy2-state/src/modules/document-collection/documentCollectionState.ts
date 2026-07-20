import { createStore, type StoreApi } from "zustand/vanilla";
import { type DocumentSummary, type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface DocumentCollectionActionContext {
    readonly runtime: StateRuntime;
    readonly documents: DocumentCollectionStore;
}

interface DocumentCollectionLoadState {
    running: boolean;
    queued: boolean;
}

const loadStates = new WeakMap<DocumentCollectionStore, DocumentCollectionLoadState>();

/**
 * Loads every document visible to the signed-in user with single-flight
 * coalescing, so a burst of documents-area hints costs at most one trailing
 * refetch. This is the whole collection, independent of any channel: a document
 * the user owns but has attached nowhere still appears here.
 */
export async function documentCollectionLoad(
    context: DocumentCollectionActionContext,
): Promise<void> {
    const binding = context.documents;
    const state = loadStates.get(binding) ?? { running: false, queued: false };
    loadStates.set(binding, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        if (binding.getState().documents.type !== "ready")
            binding.getState().documentCollectionInput({ type: "documentCollectionLoading" });
        do {
            state.queued = false;
            try {
                const result = await context.runtime.operation("getDocuments", {});
                binding.getState().documentCollectionInput({
                    type: "documentCollectionLoaded",
                    documents: result.documents,
                });
            } catch (error) {
                if (!state.queued)
                    binding.getState().documentCollectionInput({
                        type: "documentCollectionFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

/** Creates the global document collection surface with one coarse subscription. */
export function documentCollectionStoreCreate(): DocumentCollectionStore {
    return createStore<DocumentCollectionState>()((set) => ({
        documents: { type: "unloaded" },
        documentCollectionInput(event): void {
            set((snapshot) => {
                if (event.type === "documentCollectionLoading")
                    return { ...snapshot, documents: { type: "loading" } };
                if (event.type === "documentCollectionFailed")
                    return { ...snapshot, documents: { type: "error", error: event.error } };
                return { ...snapshot, documents: { type: "ready", value: event.documents } };
            });
        },
    }));
}

export interface DocumentCollectionSnapshot {
    readonly documents: Loadable<readonly DocumentSummary[]>;
}

export type DocumentCollectionInput =
    | { readonly type: "documentCollectionLoading" }
    | {
          readonly type: "documentCollectionLoaded";
          readonly documents: readonly DocumentSummary[];
      }
    | { readonly type: "documentCollectionFailed"; readonly error: UserError };

export interface DocumentCollectionState extends DocumentCollectionSnapshot {
    documentCollectionInput(event: DocumentCollectionInput): void;
}

export type DocumentCollectionStore = StoreApi<DocumentCollectionState>;
