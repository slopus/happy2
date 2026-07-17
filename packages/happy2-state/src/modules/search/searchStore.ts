import { storeCreate } from "../../kernel/store.js";
import type { SearchInput, SearchOutput, SearchSnapshot, SearchStore } from "./searchTypes.js";

export interface SearchStoreBinding {
    readonly store: SearchStore;
    generation: number;
    searchInput(event: SearchInput): void;
    dispose(): void;
}

/** Creates one coarse global-search surface whose query changes are synchronous and typed. */
export function searchStoreCreateBinding(
    output: (event: SearchOutput) => void = () => undefined,
): SearchStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<SearchSnapshot>({
        query: "",
        results: { type: "ready", value: [] },
        files: [],
    });
    let disposed = false;
    const binding: SearchStoreBinding = {
        generation: 0,
        store: {
            ...readonlyStore,
            queryUpdate(query): void {
                if (disposed) return;
                writer.update((snapshot) =>
                    snapshot.query === query ? snapshot : { ...snapshot, query },
                );
                output({ type: "queryUpdated", query });
            },
        },
        searchInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.query !== snapshot.query) return snapshot;
                if (event.type === "searchLoading")
                    return {
                        ...snapshot,
                        results: { type: "loading" },
                        files: [],
                        nextCursor: undefined,
                    };
                if (event.type === "searchFailed")
                    return { ...snapshot, results: { type: "error", error: event.error } };
                return {
                    ...snapshot,
                    results: { type: "ready", value: event.results },
                    files: event.files,
                    nextCursor: event.nextCursor,
                };
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            binding.generation += 1;
            writer.dispose();
        },
    };
    return binding;
}
