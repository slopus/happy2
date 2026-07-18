import { createStore, type StoreApi } from "zustand/vanilla";
import { type SearchResultSummary } from "../../resources.js";
import { type ChatSummary, type FileSummary, type UserError } from "../../types.js";
import { type ChatMessageProjection, type Loadable } from "../chat/chatState.js";
import { messageProject } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface SearchActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly search: SearchStore;
}

const generations = new WeakMap<SearchStore, number>();

/** Resolves one typed global query and ignores every completion superseded by later input. */
export async function searchQueryUpdate(
    context: SearchActionContext,
    query: string,
): Promise<void> {
    const normalized = query.trim();
    const generation = (generations.get(context.search) ?? 0) + 1;
    generations.set(context.search, generation);
    if (!normalized) {
        context.search
            .getState()
            .searchInput({ type: "searchLoaded", query, results: [], files: [] });
        return;
    }
    context.search.getState().searchInput({ type: "searchLoading", query });
    try {
        const [search, files] = await Promise.all([
            context.runtime.operation("search", { q: normalized, limit: 50 }),
            context.runtime.operation("getFiles", { limit: 100 }),
        ]);
        if (generation !== generations.get(context.search)) return;
        context.search.getState().searchInput({
            type: "searchLoaded",
            query,
            results: search.results.map((result) => project(context, result)),
            files: files.files.filter((file) =>
                (file.originalName ?? "").toLowerCase().includes(normalized.toLowerCase()),
            ),
            nextCursor: search.nextCursor,
        });
    } catch (error) {
        if (generation === generations.get(context.search))
            context.search
                .getState()
                .searchInput({ type: "searchFailed", query, error: userError(error) });
    }
}

function project(
    context: SearchActionContext,
    result: SearchResultSummary,
): SearchResultProjection {
    if (result.type === "message")
        return { ...result, message: messageProject(context.identities, result.message) };
    if (result.type === "user") return { ...result, user: context.identities.project(result.user) };
    return result;
}

/** Creates one coarse global-search surface whose query changes are synchronous and typed. */
export function searchStoreCreate(
    output: (event: SearchOutput) => void = () => undefined,
): SearchStore {
    const store = createStore<SearchState>()((set, get) => ({
        query: "",
        results: { type: "ready", value: [] },
        files: [],
        queryUpdate(query): void {
            if (get().query === query) return;
            set({ query });
            output({ type: "queryUpdated", query });
        },
        searchInput(event): void {
            set((snapshot) => {
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
    }));
    generations.set(store, 0);
    return store;
}

export type SearchResultProjection =
    | { readonly type: "message"; readonly score: number; readonly message: ChatMessageProjection }
    | { readonly type: "channel"; readonly score: number; readonly channel: ChatSummary }
    | { readonly type: "user"; readonly score: number; readonly user: IdentityProjection };

export interface SearchSnapshot {
    readonly query: string;
    readonly results: Loadable<readonly SearchResultProjection[]>;
    readonly files: readonly FileSummary[];
    readonly nextCursor?: string;
}

export type SearchOutput = { readonly type: "queryUpdated"; readonly query: string };

export type SearchInput =
    | { readonly type: "searchLoading"; readonly query: string }
    | {
          readonly type: "searchLoaded";
          readonly query: string;
          readonly results: readonly SearchResultProjection[];
          readonly files: readonly FileSummary[];
          readonly nextCursor?: string;
      }
    | { readonly type: "searchFailed"; readonly query: string; readonly error: UserError };

export interface SearchState extends SearchSnapshot {
    queryUpdate(query: string): void;
    searchInput(event: SearchInput): void;
}

export type SearchStore = StoreApi<SearchState>;
