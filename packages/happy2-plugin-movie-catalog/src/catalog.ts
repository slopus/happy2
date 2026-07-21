import type { CallToolResult } from "happy2-plugin-sdk/server";

export const GHIBLI_FILMS_URL = "https://ghibliapi.vercel.app/films";

export interface MovieCatalogMovie {
    readonly [key: string]: unknown;
    readonly director?: string;
    readonly genres: readonly string[];
    readonly id: string;
    readonly imageUrl?: string;
    readonly originalTitle?: string;
    readonly rating?: number;
    readonly runtimeMinutes?: number;
    readonly summary?: string;
    readonly title: string;
    readonly year?: number;
}

export interface MovieCatalogResult {
    readonly [key: string]: unknown;
    readonly movie: MovieCatalogMovie;
    readonly position: number;
    readonly query: string;
    readonly resultCount: number;
}

export type CatalogFetch = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Pick<Response, "json" | "ok" | "status">>;

/** Queries the public catalog and returns the bounded result consumed by text and app clients. */
export async function movieCatalogResult(
    fetchCatalog: CatalogFetch,
    rawQuery: string,
    requestedPosition: number,
): Promise<CallToolResult> {
    const query = requiredQuery(rawQuery);
    if (!Number.isInteger(requestedPosition) || requestedPosition < 0 || requestedPosition > 9)
        throw new Error("Movie position must be an integer from 0 through 9.");
    const response = await fetchCatalog(GHIBLI_FILMS_URL, {
        headers: { accept: "application/json", "user-agent": "Happy2-Movie-Catalog/1.0" },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Studio Ghibli catalog returned HTTP ${response.status}.`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0)
        return {
            isError: true,
            content: [{ type: "text", text: `No movies matched “${query}”.` }],
        };
    const needle = query.toLocaleLowerCase();
    const matches = rows.filter((value) =>
        searchableValues(value).some((item) => item.toLocaleLowerCase().includes(needle)),
    );
    const catalog = matches.length ? matches : rows;
    const position = Math.min(requestedPosition, catalog.length - 1, 9);
    const movie = asMovie(catalog[position]);
    const structuredContent: MovieCatalogResult = {
        query,
        position,
        resultCount: Math.min(catalog.length, 10),
        movie,
    };
    return {
        content: [
            {
                type: "text",
                text: `${movie.title}${movie.year ? ` (${movie.year})` : ""}${movie.summary ? ` — ${movie.summary}` : ""}`,
            },
            {
                type: "resource_link",
                uri: movieSharedUrl(movie),
                name: movie.title,
                title: movie.year ? `${movie.title} (${movie.year})` : movie.title,
                ...(movie.summary ? { description: movie.summary } : {}),
                mimeType: "text/html",
            },
        ],
        structuredContent,
    };
}

function movieSharedUrl(movie: MovieCatalogMovie): string {
    const query = new URLSearchParams({ search: `${movie.title} Studio Ghibli` });
    return `https://en.wikipedia.org/wiki/Special:Search?${query}`;
}

export function requiredQuery(value: string): string {
    if (!value.trim() || value.length > 120)
        throw new Error("A movie search query from 1 through 120 characters is required.");
    return value.trim();
}

function searchableValues(value: unknown): readonly string[] {
    const film = recordOrUndefined(value);
    if (!film) return [];
    return [
        film.title,
        film.original_title,
        film.original_title_romanised,
        film.description,
    ].filter((item): item is string => typeof item === "string");
}

function asMovie(value: unknown): MovieCatalogMovie {
    const film = record(value, "Studio Ghibli film");
    return {
        id: String(film.id ?? "unknown"),
        title: typeof film.title === "string" ? film.title : "Untitled",
        ...(typeof film.original_title === "string" ? { originalTitle: film.original_title } : {}),
        ...integer(film.release_date, "year"),
        genres: ["Animation"],
        ...(typeof film.description === "string" ? { summary: film.description } : {}),
        ...(typeof film.image === "string" ? { imageUrl: film.image } : {}),
        ...rating(film.rt_score),
        ...integer(film.running_time, "runtimeMinutes"),
        ...(typeof film.director === "string" ? { director: film.director } : {}),
    };
}

function integer(value: unknown, key: "runtimeMinutes" | "year"): Partial<MovieCatalogMovie> {
    if (typeof value !== "string") return {};
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? { [key]: parsed } : {};
}

function rating(value: unknown): Pick<MovieCatalogMovie, "rating"> | {} {
    if (typeof value !== "string") return {};
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? { rating: parsed / 10 } : {};
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    const result = recordOrUndefined(value);
    if (!result) throw new Error(`${label} must be an object.`);
    return result;
}

function recordOrUndefined(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Readonly<Record<string, unknown>>)
        : undefined;
}
