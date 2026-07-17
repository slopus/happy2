import { levenshtein } from "./levenshtein.js";
import { normalizeSearch } from "../normalizeSearch.js";
export function fuzzyScore(query: string, candidate: string): number {
    const normalized = normalizeSearch(candidate);
    if (!query || !normalized) return 0;
    if (normalized === query) return 1;
    if (normalized.startsWith(query)) return 0.96;
    if (normalized.includes(query)) return 0.9;
    let best = 0;
    for (const token of normalized.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean)) {
        const distance = levenshtein(query, token);
        const longest = Math.max(query.length, token.length);
        const similarity = longest === 0 ? 1 : 1 - distance / longest;
        if (distance <= Math.max(1, Math.floor(longest / 3)))
            best = Math.max(best, similarity * 0.82);
    }
    return best;
}
