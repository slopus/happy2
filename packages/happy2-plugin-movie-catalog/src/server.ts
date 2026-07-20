import { resolve } from "node:path";
import {
    McpServer,
    appToolMetadata,
    registerAppTool,
    registerHtmlAppResource,
    type CallToolResult,
} from "happy2-plugin-sdk/server";
import { z } from "zod/v4";
import { movieCatalogResult, type CatalogFetch } from "./catalog.js";

export const MOVIE_APP_URI = "ui://movie-catalog/movie.html" as const;

export interface MovieCatalogServerOptions {
    readonly appHtmlPath?: string;
    readonly fetch?: CatalogFetch;
}

/** Creates the official MCP server shared by the built entrypoint and tests. */
export function createMovieCatalogServer(options: MovieCatalogServerOptions = {}): McpServer {
    const server = new McpServer({ name: "happy2-movie-catalog", version: "1.0.0" });
    const fetchCatalog = options.fetch ?? globalThis.fetch;

    registerAppTool(
        server,
        "movie_search",
        {
            title: "Show movie catalog",
            description:
                "Searches the public Studio Ghibli no-auth catalog and shows the best matching movie in an interactive card.",
            inputSchema: z.strictObject({
                query: z
                    .string()
                    .min(1)
                    .max(120)
                    .describe("Movie title or keywords to search for."),
            }),
            _meta: appToolMetadata({
                resourceUri: MOVIE_APP_URI,
                visibility: ["model", "app"],
            }),
        },
        ({ query }) => safeTool(() => movieCatalogResult(fetchCatalog, query, 0)),
    );

    registerAppTool(
        server,
        "movie_browse",
        {
            title: "Browse movie results",
            description: "Moves an interactive catalog card to another result for the same search.",
            inputSchema: z.strictObject({
                query: z.string().min(1).max(120),
                position: z.number().int().min(0).max(9),
            }),
            _meta: { ui: { visibility: ["app"] } },
        },
        ({ query, position }) => safeTool(() => movieCatalogResult(fetchCatalog, query, position)),
    );

    registerHtmlAppResource(server, {
        name: "Interactive movie catalog",
        description: "A compact movie card with server-backed previous and next controls.",
        uri: MOVIE_APP_URI,
        htmlPath: options.appHtmlPath ?? resolve(import.meta.dirname, "apps/movie.html"),
        csp: {
            connectDomains: [],
            resourceDomains: ["https://image.tmdb.org"],
            frameDomains: [],
            baseUriDomains: [],
        },
        permissions: {},
        prefersBorder: true,
    });
    return server;
}

async function safeTool(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await work();
    } catch (error) {
        return {
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
        };
    }
}
