import { createInterface } from "node:readline";

const APP_URI = "ui://movie-catalog/movie.html";
const APP_MIME = "text/html;profile=mcp-app";
const UI_EXTENSION = "io.modelcontextprotocol/ui";
const GHIBLI_FILMS_URL = "https://ghibliapi.vercel.app/films";
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let uiEnabled = false;

for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
        request = JSON.parse(line);
    } catch {
        continue;
    }
    if (request.id === undefined) continue;
    const response = await handle(request).catch((error) => ({
        result: {
            isError: true,
            content: [
                {
                    type: "text",
                    text:
                        error instanceof Error
                            ? error.message
                            : "The movie catalog request failed.",
                },
            ],
        },
    }));
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, ...response })}\n`);
}

async function handle(request) {
    if (request.method === "initialize") {
        const extension = request.params?.capabilities?.extensions?.[UI_EXTENSION];
        uiEnabled = Boolean(extension?.mimeTypes?.includes(APP_MIME));
        return {
            result: {
                protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
                capabilities: {
                    extensions: { [UI_EXTENSION]: {} },
                    resources: {},
                    tools: {},
                },
                serverInfo: { name: "happy2-movie-catalog", version: "1.0.0" },
            },
        };
    }
    if (request.method === "ping") return { result: {} };
    if (request.method === "tools/list") return { result: { tools: tools() } };
    if (request.method === "resources/list") {
        return {
            result: {
                resources: uiEnabled
                    ? [
                          {
                              uri: APP_URI,
                              name: "Interactive movie catalog",
                              description:
                                  "A compact movie card with server-backed previous and next controls.",
                              mimeType: APP_MIME,
                              _meta: appResourceMeta(),
                          },
                      ]
                    : [],
            },
        };
    }
    if (request.method === "resources/read" && request.params?.uri === APP_URI) {
        if (!uiEnabled)
            return { error: { code: -32602, message: "This client did not negotiate MCP Apps" } };
        return {
            result: {
                contents: [
                    {
                        uri: APP_URI,
                        mimeType: APP_MIME,
                        text: appHtml(),
                        _meta: appResourceMeta(),
                    },
                ],
            },
        };
    }
    if (request.method === "tools/call" && request.params?.name === "movie_search")
        return { result: await movieSearch(request.params?.arguments) };
    if (request.method === "tools/call" && request.params?.name === "movie_browse")
        return { result: await movieBrowse(request.params?.arguments) };
    return { error: { code: -32601, message: `Method not found: ${String(request.method)}` } };
}

function tools() {
    const search = {
        name: "movie_search",
        title: "Show movie catalog",
        description:
            "Searches the public Studio Ghibli no-auth catalog and shows the best matching movie in an interactive card.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    minLength: 1,
                    maxLength: 120,
                    description: "Movie title or keywords to search for.",
                },
            },
            required: ["query"],
            additionalProperties: false,
        },
    };
    if (uiEnabled)
        search._meta = {
            ui: { resourceUri: APP_URI, visibility: ["model", "app"] },
        };
    const browse = {
        name: "movie_browse",
        title: "Browse movie results",
        description: "Moves an interactive catalog card to another result for the same search.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", minLength: 1, maxLength: 120 },
                position: { type: "integer", minimum: 0, maximum: 9 },
            },
            required: ["query", "position"],
            additionalProperties: false,
        },
    };
    if (uiEnabled) browse._meta = { ui: { visibility: ["app"] } };
    return [search, browse];
}

async function movieSearch(value) {
    const input = record(value, "Movie search input");
    return movieResult(requiredQuery(input.query), 0);
}

async function movieBrowse(value) {
    const input = record(value, "Movie browse input");
    const query = requiredQuery(input.query);
    if (!Number.isInteger(input.position) || input.position < 0 || input.position > 9)
        throw new Error("Movie position must be an integer from 0 through 9.");
    return movieResult(query, input.position);
}

async function movieResult(query, requestedPosition) {
    const response = await fetch(GHIBLI_FILMS_URL, {
        headers: { accept: "application/json", "user-agent": "Happy2-Movie-Catalog/1.0" },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Studio Ghibli catalog returned HTTP ${response.status}.`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0)
        return {
            isError: true,
            content: [{ type: "text", text: `No movies matched “${query}”.` }],
        };
    const needle = query.toLocaleLowerCase();
    const matches = rows.filter((value) => {
        const film = recordOrUndefined(value);
        return [
            film?.title,
            film?.original_title,
            film?.original_title_romanised,
            film?.description,
        ]
            .filter((item) => typeof item === "string")
            .some((item) => item.toLocaleLowerCase().includes(needle));
    });
    const catalog = matches.length > 0 ? matches : rows;
    const position = Math.min(requestedPosition, catalog.length - 1, 9);
    const movie = asMovie(catalog[position]);
    return {
        content: [
            {
                type: "text",
                text: `${movie.title}${movie.year ? ` (${movie.year})` : ""}${movie.summary ? ` — ${movie.summary}` : ""}`,
            },
        ],
        structuredContent: {
            query,
            position,
            resultCount: Math.min(catalog.length, 10),
            movie,
        },
    };
}

function asMovie(value) {
    const film = record(value, "Studio Ghibli film");
    return {
        id: String(film.id ?? "unknown"),
        title: typeof film.title === "string" ? film.title : "Untitled",
        ...(typeof film.original_title === "string" ? { originalTitle: film.original_title } : {}),
        ...(typeof film.release_date === "string"
            ? { year: Number.parseInt(film.release_date, 10) }
            : {}),
        genres: ["Animation"],
        ...(typeof film.description === "string" ? { summary: film.description } : {}),
        ...(typeof film.image === "string" ? { imageUrl: film.image } : {}),
        ...(typeof film.rt_score === "string"
            ? { rating: Number.parseInt(film.rt_score, 10) / 10 }
            : {}),
        ...(typeof film.running_time === "string"
            ? { runtimeMinutes: Number.parseInt(film.running_time, 10) }
            : {}),
        ...(typeof film.director === "string" ? { director: film.director } : {}),
    };
}

function appResourceMeta() {
    return {
        ui: {
            csp: {
                connectDomains: [],
                resourceDomains: ["https://image.tmdb.org"],
                frameDomains: [],
                baseUriDomains: [],
            },
            permissions: {},
            prefersBorder: true,
        },
    };
}

function requiredQuery(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 120)
        throw new Error("A movie search query from 1 through 120 characters is required.");
    return value.trim();
}

function record(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${name} must be an object.`);
    return value;
}

function recordOrUndefined(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function appHtml() {
    return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Movie catalog</title>
<style>
:root{color-scheme:light dark;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);background:transparent;color:var(--color-text-primary,CanvasText)}
*{box-sizing:border-box}body{margin:0;padding:12px;background:transparent}.card{display:flex;min-height:248px;overflow:hidden;border:1px solid var(--color-border-primary,color-mix(in srgb,CanvasText 18%,transparent));border-radius:16px;background:var(--color-background-primary,Canvas);box-shadow:0 10px 30px color-mix(in srgb,#000 14%,transparent)}
.poster{flex:0 0 176px;min-height:248px;background:linear-gradient(145deg,#121a2d,#283650);display:flex;align-items:center;justify-content:center;color:#f8c55b;font-size:42px}.poster img{width:100%;height:100%;object-fit:cover}.body{display:flex;flex:1;min-width:0;flex-direction:column;gap:12px;padding:20px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--color-text-secondary,#777)}h1{margin:0;font-size:26px;line-height:1.1}.meta{display:flex;flex-wrap:wrap;gap:8px;font-size:13px;color:var(--color-text-secondary,#777)}.pill{padding:3px 8px;border-radius:999px;background:var(--color-background-secondary,color-mix(in srgb,CanvasText 8%,transparent))}.summary{margin:0;display:-webkit-box;overflow:hidden;font-size:14px;line-height:1.45;-webkit-line-clamp:4;-webkit-box-orient:vertical}.actions{display:flex;align-items:center;gap:8px;margin-top:auto}button{height:34px;border:1px solid var(--color-border-primary,color-mix(in srgb,CanvasText 18%,transparent));border-radius:8px;padding:0 12px;background:var(--color-background-secondary,color-mix(in srgb,CanvasText 7%,transparent));color:inherit;font:inherit;font-weight:650;cursor:pointer}button:hover{background:var(--color-background-tertiary,color-mix(in srgb,CanvasText 12%,transparent))}button:disabled{cursor:default;opacity:.45}.count{margin-left:auto;font-size:12px;color:var(--color-text-secondary,#777)}.state{min-height:120px;align-items:center;justify-content:center;padding:24px;text-align:center}.error{color:#c43b35}
</style>
</head>
<body><main id="root"><section class="card state">Connecting to Happy…</section></main>
<script>
(()=>{'use strict';
const root=document.getElementById('root');let nextId=1;let connected=false;let input={};let current;const pending=new Map();
function send(message){window.parent.postMessage(message,'*')}
function request(method,params){return new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});send({jsonrpc:'2.0',id,method,params})})}
function notify(method,params){send({jsonrpc:'2.0',method,params})}
window.addEventListener('message',(event)=>{if(event.source!==window.parent)return;const message=event.data;if(!message||message.jsonrpc!=='2.0')return;if(message.id!==undefined&&!message.method){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);return}if(message.method==='ui/notifications/tool-input'){input=message.params?.arguments||{};return}if(message.method==='ui/notifications/tool-result'){showResult(message.params);return}if(message.method==='ui/notifications/tool-cancelled'){showError(message.params?.reason||'The movie request was cancelled.');return}if(message.method==='ui/resource-teardown'){send({jsonrpc:'2.0',id:message.id,result:{}});return}});
async function connect(){try{await request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'Happy Movie Catalog',version:'1.0.0'},appCapabilities:{}});notify('ui/notifications/initialized',{});connected=true}catch(error){showError(error.message)}}
function showResult(result){const data=result?.structuredContent;if(!data?.movie){showError(result?.content?.find?.((part)=>part.type==='text')?.text||'No movie was returned.');return}current=data;render()}
function escape(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function render(){const movie=current.movie;const genres=(movie.genres||[]).map((genre)=>'<span class="pill">'+escape(genre)+'</span>').join('');const facts=[movie.year?'<span>'+escape(movie.year)+'</span>':'',movie.runtimeMinutes?'<span>'+escape(movie.runtimeMinutes)+' min</span>':'',movie.rating?'<span>★ '+escape(movie.rating)+'</span>':'',movie.director?'<span>'+escape(movie.director)+'</span>':''].filter(Boolean).join('<span>·</span>');root.innerHTML='<section class="card"><div class="poster">'+(movie.imageUrl?'<img alt="" src="'+escape(movie.imageUrl)+'">':'▶')+'</div><div class="body"><div class="eyebrow">Studio Ghibli · public catalog</div><h1>'+escape(movie.title)+'</h1><div class="meta">'+facts+genres+'</div><p class="summary">'+escape(movie.summary||'No synopsis is available for this title.')+'</p><div class="actions"><button data-step="-1" '+(current.position<=0?'disabled':'')+'>Previous</button><button data-step="1" '+(current.position>=current.resultCount-1?'disabled':'')+'>Next</button><span class="count">'+escape(current.position+1)+' of '+escape(current.resultCount)+'</span></div></div></section>';root.querySelectorAll('button[data-step]').forEach((button)=>button.addEventListener('click',()=>browse(Number(button.dataset.step))))}
async function browse(step){if(!connected||!current)return;root.querySelectorAll('button').forEach((button)=>button.disabled=true);try{const result=await request('tools/call',{name:'movie_browse',arguments:{query:current.query,position:current.position+step}});showResult(result)}catch(error){showError(error.message)}}
function showError(message){root.innerHTML='<section class="card state error">'+escape(message)+'</section>'}
new ResizeObserver(()=>notify('ui/notifications/size-changed',{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})).observe(document.body);connect();
})();
</script>
</body>
</html>`;
}
