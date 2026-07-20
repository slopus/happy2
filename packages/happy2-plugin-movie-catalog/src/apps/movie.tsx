import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useHappyApp } from "happy2-plugin-sdk/app";

/*
 * Interactive movie catalog app (MCP Apps view). It renders one Studio Ghibli
 * catalog entry as an editorial "now showing" card and pages through the search
 * results by calling the app-visible `movie_browse` tool. It reads its initial
 * entry from the opening tool's structured result and never fetches directly —
 * the resource CSP allows only https://image.tmdb.org poster images.
 */

interface MovieCatalogMovie {
    readonly id: string;
    readonly title: string;
    readonly originalTitle?: string;
    readonly year?: number;
    readonly genres: readonly string[];
    readonly summary?: string;
    readonly imageUrl?: string;
    readonly rating?: number;
    readonly runtimeMinutes?: number;
    readonly director?: string;
}

interface MovieCatalogResult {
    readonly query: string;
    readonly position: number;
    readonly resultCount: number;
    readonly movie: MovieCatalogMovie;
}

interface ToolResultLike {
    readonly structuredContent?: unknown;
    readonly isError?: boolean;
    readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
}

function asResult(value: unknown): MovieCatalogResult | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    const movie = record.movie;
    if (!movie || typeof movie !== "object") return undefined;
    return record as unknown as MovieCatalogResult;
}

function runtimeLabel(minutes?: number): string | undefined {
    if (!minutes || minutes <= 0) return undefined;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours > 0 ? `${hours}h ${rest.toString().padStart(2, "0")}m` : `${rest}m`;
}

function MovieApp() {
    const { app, error, isConnected, toolInput, toolResult } = useHappyApp({
        appInfo: { name: "movie-catalog", version: "1.0.0" },
        autoResize: true,
    });

    // The displayed entry starts as the opening tool result and advances locally
    // as the viewer pages; the host result is the authoritative seed.
    const seeded = asResult((toolResult as ToolResultLike | undefined)?.structuredContent);
    const [override, setOverride] = useState<MovieCatalogResult | undefined>(undefined);
    const [pending, setPending] = useState(false);
    const [browseError, setBrowseError] = useState<string | undefined>(undefined);

    const current = override ?? seeded;
    const inputQuery = typeof toolInput?.query === "string" ? toolInput.query : undefined;
    const query = current?.query ?? inputQuery ?? "";

    const browse = async (position: number) => {
        if (!app || pending) return;
        setPending(true);
        setBrowseError(undefined);
        try {
            const result = (await app.callServerTool({
                name: "movie_browse",
                arguments: { query, position },
            })) as ToolResultLike;
            const parsed = asResult(result.structuredContent);
            if (parsed) setOverride(parsed);
            else setBrowseError("That result could not be loaded.");
        } catch (cause) {
            setBrowseError(cause instanceof Error ? cause.message : "Could not load that result.");
        } finally {
            setPending(false);
        }
    };

    if (error)
        return (
            <Frame>
                <Notice tone="error" title="Catalog unavailable">
                    {error.message}
                </Notice>
            </Frame>
        );
    if (!isConnected || !current)
        return (
            <Frame>
                <Notice tone="muted" title={query ? `Searching “${query}”` : "Loading catalog"}>
                    Preparing the projection room…
                </Notice>
            </Frame>
        );

    const { movie, position, resultCount } = current;
    const runtime = runtimeLabel(movie.runtimeMinutes);
    const meta = [movie.year ? String(movie.year) : undefined, runtime, movie.director].filter(
        Boolean,
    ) as string[];

    return (
        <Frame>
            <article className="mc-card" aria-busy={pending}>
                <div className="mc-poster">
                    {movie.imageUrl ? (
                        <img
                            alt={`${movie.title} poster`}
                            className="mc-poster-img"
                            src={movie.imageUrl}
                        />
                    ) : (
                        <div className="mc-poster-fallback" aria-hidden="true">
                            {movie.title.slice(0, 1)}
                        </div>
                    )}
                    {typeof movie.rating === "number" ? (
                        <span
                            className="mc-rating"
                            aria-label={`Rating ${movie.rating.toFixed(1)} of 10`}
                        >
                            ★ {movie.rating.toFixed(1)}
                        </span>
                    ) : null}
                </div>
                <div className="mc-body">
                    <p className="mc-kicker">Now showing{query ? ` · ${query}` : ""}</p>
                    <h1 className="mc-title">{movie.title}</h1>
                    {movie.originalTitle && movie.originalTitle !== movie.title ? (
                        <p className="mc-original">{movie.originalTitle}</p>
                    ) : null}
                    {meta.length > 0 ? <p className="mc-meta">{meta.join("  ·  ")}</p> : null}
                    {movie.genres.length > 0 ? (
                        <ul className="mc-genres">
                            {movie.genres.map((genre) => (
                                <li className="mc-genre" key={genre}>
                                    {genre}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {movie.summary ? <p className="mc-summary">{movie.summary}</p> : null}
                    {browseError ? <p className="mc-error">{browseError}</p> : null}
                    <div className="mc-controls">
                        <button
                            className="mc-btn"
                            disabled={pending || position <= 0}
                            onClick={() => browse(position - 1)}
                            type="button"
                        >
                            ‹ Previous
                        </button>
                        <span className="mc-count">
                            {resultCount > 0 ? `${position + 1} of ${resultCount}` : "No results"}
                        </span>
                        <button
                            className="mc-btn mc-btn-primary"
                            disabled={pending || position >= resultCount - 1}
                            onClick={() => browse(position + 1)}
                            type="button"
                        >
                            Next ›
                        </button>
                    </div>
                </div>
            </article>
        </Frame>
    );
}

function Frame(props: { children: ReactNode }) {
    return (
        <div className="mc-root">
            <style>{STYLES}</style>
            {props.children}
        </div>
    );
}

function Notice(props: { tone: "error" | "muted"; title: string; children: ReactNode }) {
    return (
        <div
            className={`mc-notice mc-notice-${props.tone}`}
            role={props.tone === "error" ? "alert" : "status"}
        >
            <p className="mc-notice-title">{props.title}</p>
            <p className="mc-notice-body">{props.children}</p>
        </div>
    );
}

const STYLES = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; }
.mc-root {
  font-family: "Figtree", system-ui, -apple-system, sans-serif;
  color: #f2ede4;
  background:
    radial-gradient(120% 90% at 15% 0%, #2a2440 0%, rgba(42,36,64,0) 55%),
    radial-gradient(120% 120% at 100% 100%, #402032 0%, rgba(64,32,50,0) 55%),
    #0d0b14;
  min-height: 100vh;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Adapt to the width the host allocates this iframe (not a device viewport):
     a size container lets the card stack when the frame itself is narrow. */
  container-type: inline-size;
}
.mc-card {
  display: flex;
  gap: 28px;
  max-width: 760px;
  width: 100%;
  padding: 20px;
  background: rgba(20, 17, 30, 0.72);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  transition: opacity 160ms ease;
}
.mc-card[aria-busy="true"] { opacity: 0.72; }
.mc-poster {
  position: relative;
  flex: 0 0 220px;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: #17131f;
}
.mc-poster-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mc-poster-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 84px; font-weight: 700; color: rgba(255,255,255,0.18);
}
.mc-rating {
  position: absolute; top: 10px; left: 10px;
  padding: 4px 9px; border-radius: 999px;
  background: rgba(0,0,0,0.6); color: #ffd27a;
  font-size: 13px; font-weight: 600;
  backdrop-filter: blur(4px);
}
.mc-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.mc-kicker { margin: 0; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #b7a6ff; }
.mc-title { margin: 0; font-size: 30px; line-height: 1.05; font-weight: 700; letter-spacing: -0.01em; }
.mc-original { margin: 0; font-size: 15px; color: #b8b0c4; font-style: italic; }
.mc-meta { margin: 2px 0 0; font-size: 14px; color: #cfc7dc; }
.mc-genres { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
.mc-genre { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: rgba(183,166,255,0.14); color: #d7ccff; }
.mc-summary { margin: 8px 0 0; font-size: 15px; line-height: 1.55; color: #e7e1ec; }
.mc-error { margin: 6px 0 0; font-size: 13px; color: #ff9a8f; }
.mc-controls { margin-top: auto; padding-top: 16px; display: flex; align-items: center; gap: 12px; }
.mc-count { flex: 1 1 auto; text-align: center; font-size: 13px; color: #b8b0c4; }
.mc-btn {
  appearance: none; border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.04); color: #f2ede4;
  font: inherit; font-size: 14px; font-weight: 600;
  padding: 9px 16px; border-radius: 10px; cursor: pointer;
  transition: background 120ms ease, opacity 120ms ease;
}
.mc-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.mc-btn:disabled { opacity: 0.4; cursor: default; }
.mc-btn-primary { background: #b7a6ff; border-color: #b7a6ff; color: #16121f; }
.mc-btn-primary:hover:not(:disabled) { background: #c8bbff; }
.mc-notice { max-width: 420px; text-align: center; }
.mc-notice-title { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
.mc-notice-body { margin: 0; color: #b8b0c4; font-size: 14px; }
.mc-notice-error .mc-notice-title { color: #ff9a8f; }
@container (max-width: 620px) { .mc-card { flex-direction: column; } .mc-poster { flex-basis: auto; max-width: 220px; } }
`;

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <MovieApp />
    </StrictMode>,
);
