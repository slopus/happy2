import type { SearchResultSummary } from "../../resources.js";
import { messageProject } from "../chat/messageProject.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { SearchStoreBinding } from "./searchStore.js";
import type { SearchResultProjection } from "./searchTypes.js";

export interface SearchActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly search: SearchStoreBinding;
}

/** Resolves one typed global query and ignores every completion superseded by later input. */
export async function searchQueryUpdate(
    context: SearchActionContext,
    query: string,
): Promise<void> {
    const normalized = query.trim();
    const generation = ++context.search.generation;
    if (!normalized) {
        context.search.searchInput({ type: "searchLoaded", query, results: [], files: [] });
        return;
    }
    context.search.searchInput({ type: "searchLoading", query });
    try {
        const [search, files] = await Promise.all([
            context.runtime.operation("search", { q: normalized, limit: 50 }),
            context.runtime.operation("getFiles", { limit: 100 }),
        ]);
        if (generation !== context.search.generation) return;
        context.search.searchInput({
            type: "searchLoaded",
            query,
            results: search.results.map((result) => project(context, result)),
            files: files.files.filter((file) =>
                (file.originalName ?? "").toLowerCase().includes(normalized.toLowerCase()),
            ),
            nextCursor: search.nextCursor,
        });
    } catch (error) {
        if (generation === context.search.generation)
            context.search.searchInput({ type: "searchFailed", query, error: userError(error) });
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
