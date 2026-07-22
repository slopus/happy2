import { createStore, type StoreApi } from "zustand/vanilla";
import { type DocumentSummary, type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface DocumentListActionContext {
    readonly runtime: StateRuntime;
    documentListGet(chatId: string): DocumentListStore | undefined;
}

interface DocumentListLoadState {
    running: boolean;
    queued: boolean;
}

const loadStates = new WeakMap<DocumentListStore, DocumentListLoadState>();

/**
 * Loads one channel's document summaries with single-flight coalescing, so a
 * burst of documents-area hints costs at most one trailing refetch and a
 * completion after the cached surface was evicted is discarded.
 */
export async function documentListLoad(
    context: DocumentListActionContext,
    chatId: string,
): Promise<void> {
    const binding = context.documentListGet(chatId);
    if (!binding) return;
    const state = loadStates.get(binding) ?? { running: false, queued: false };
    loadStates.set(binding, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        if (binding.getState().documents.type !== "ready")
            binding.getState().documentListInput({ type: "documentListLoading" });
        do {
            state.queued = false;
            try {
                const result = await context.runtime.operation("getChatDocuments", { chatId });
                if (context.documentListGet(chatId) !== binding) return;
                binding.getState().documentListInput({
                    type: "documentListLoaded",
                    documents: result.documents,
                });
            } catch (error) {
                if (context.documentListGet(chatId) !== binding) return;
                if (!state.queued)
                    binding.getState().documentListInput({
                        type: "documentListFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

export interface DocumentListOpenContext {
    documentListAcquire(chatId: string): DocumentListStore;
    documentListRelease(chatId: string): void;
    documentListLoad(chatId: string): void;
}

/** Acquires one deduplicated channel document list without discarding it on final detach. */
export function documentListOpen(
    context: DocumentListOpenContext,
    chatId: string,
): DocumentListHandle {
    const binding = context.documentListAcquire(chatId);
    if (binding.getState().documents.type === "unloaded") context.documentListLoad(chatId);
    let disposed = false;
    return {
        ...binding,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.documentListRelease(chatId);
        },
    };
}

/** Creates one channel-scoped document list surface with a single coarse subscription. */
export function documentListStoreCreate(chatId: string): DocumentListStore {
    return createStore<DocumentListState>()((set) => ({
        chatId,
        documents: { type: "unloaded" },
        documentListInput(event): void {
            set((snapshot) => {
                if (event.type === "documentListLoading")
                    return { ...snapshot, documents: { type: "loading" } };
                if (event.type === "documentListFailed")
                    return { ...snapshot, documents: { type: "error", error: event.error } };
                return { ...snapshot, documents: { type: "ready", value: event.documents } };
            });
        },
    }));
}

export interface DocumentListSnapshot {
    readonly chatId: string;
    readonly documents: Loadable<readonly DocumentSummary[]>;
}

export type DocumentListInput =
    | { readonly type: "documentListLoading" }
    | {
          readonly type: "documentListLoaded";
          readonly documents: readonly DocumentSummary[];
      }
    | { readonly type: "documentListFailed"; readonly error: UserError };

export interface DocumentListState extends DocumentListSnapshot {
    documentListInput(event: DocumentListInput): void;
}

export type DocumentListStore = StoreApi<DocumentListState>;

export interface DocumentListHandle extends DocumentListStore, Disposable {}
