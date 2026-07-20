import { type ReactNode } from "react";
import type { McpAppResource } from "happy2-state";
import { McpAppShell } from "../../src/McpAppShell";
import { ComponentPage, Specimen } from "../kit";

/*
 * A deterministic, network-free MCP App resource: a single static HTML document
 * that paints a movie card with no timers, animation, or external assets, so the
 * sandboxed app frame renders identically on every screenshot capture.
 */
const MOVIE_APP_HTML = `<!doctype html><meta charset="utf-8"><style>
  :root { color-scheme: light dark; }
  html,body { margin:0; height:100%; }
  body {
    font-family: system-ui, sans-serif; background:#0b0b0f; color:#fff;
    display:flex; align-items:center; justify-content:center; padding:24px;
  }
  .card { display:flex; gap:16px; max-width:420px; }
  .poster { width:96px; height:132px; border-radius:8px; flex:none;
    background:linear-gradient(135deg,#4b3f72,#8a5a83); }
  h1 { margin:0 0 6px; font-size:18px; }
  p { margin:0; color:#b8b8c0; font-size:13px; line-height:18px; }
  .year { margin-top:8px; font-size:12px; color:#8e8e93; }
</style><div class="card"><div class="poster"></div><div>
  <h1>The Matrix</h1>
  <p>A hacker learns from mysterious rebels about the true nature of his reality
  and his role in the war against its controllers.</p>
  <div class="year">1999 · Science fiction</div>
</div></div>`;

const movieResource: McpAppResource = {
    html: MOVIE_APP_HTML,
    contentHashSha256: "0".repeat(64),
    meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
};

function column(children: ReactNode) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "480px" }}>
            {children}
        </div>
    );
}

export function McpAppShellPage() {
    return (
        <ComponentPage
            number="C-080"
            summary="Host surface for one interactive MCP App on an assistant message — loading, running, completed, and failed states, and the double-iframe sandbox that renders untrusted app HTML. Props only; privileged calls are delegated to callbacks."
            title="MCP app shell"
        >
            <Specimen
                detail='status="loading" · fetching the app view · static ring'
                label="Loading"
                number="01"
                stage="app"
            >
                {column(<McpAppShell status="loading" toolName="movie_show" />)}
            </Specimen>

            <Specimen
                detail='status="in_progress" · app frame renders while the tool runs'
                label="Running"
                number="02"
                stage="app"
            >
                {column(
                    <McpAppShell
                        arguments={{ query: "matrix" }}
                        resource={movieResource}
                        status="in_progress"
                        toolName="movie_show"
                    />,
                )}
            </Specimen>

            <Specimen
                detail='status="completed" · app frame with the stored tool result'
                label="Completed"
                number="03"
                stage="app"
            >
                {column(
                    <McpAppShell
                        arguments={{ query: "matrix" }}
                        resource={movieResource}
                        result={{ content: [{ type: "text", text: "The Matrix (1999)" }] }}
                        status="completed"
                        toolName="movie_show"
                    />,
                )}
            </Specimen>

            <Specimen
                detail='status="failed" · load error with a Try again action'
                label="Failed"
                number="04"
                stage="app"
            >
                {column(
                    <McpAppShell
                        error="This interactive app could not be loaded."
                        onReload={() => undefined}
                        status="failed"
                        toolName="movie_show"
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
