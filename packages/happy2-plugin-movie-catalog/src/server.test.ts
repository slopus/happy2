import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GHIBLI_FILMS_URL, movieCatalogResult, type CatalogFetch } from "./catalog.js";
import { createMovieCatalogServer, MOVIE_APP_URI } from "./server.js";

const ponyo = {
    id: "1",
    title: "Ponyo",
    original_title: "崖の上のポニョ",
    original_title_romanised: "Gake no Ue no Ponyo",
    description: "A goldfish princess befriends a boy named Sōsuke.",
    director: "Hayao Miyazaki",
    release_date: "2008",
    running_time: "101",
    rt_score: "91",
    image: "https://image.tmdb.org/ponyo.jpg",
};

afterEach(() => vi.restoreAllMocks());

describe("movie catalog MCP server", () => {
    it("advertises a model/app search, app-only browse, and the stable app resource", async () => {
        const fetchCatalog = response([ponyo]);
        const server = createMovieCatalogServer({
            appHtmlPath: "/unused/movie.html",
            fetch: fetchCatalog,
        });
        const client = new Client(
            { name: "movie-test", version: "1.0.0" },
            {
                capabilities: {
                    extensions: {
                        "io.modelcontextprotocol/ui": {
                            mimeTypes: ["text/html;profile=mcp-app"],
                        },
                    },
                } as never,
            },
        );
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        try {
            const tools = await client.listTools();
            expect(tools.tools.map(({ name }) => name)).toEqual(["movie_search", "movie_browse"]);
            expect(tools.tools[0]?._meta).toMatchObject({
                ui: { resourceUri: MOVIE_APP_URI, visibility: ["model", "app"] },
            });
            expect(tools.tools[1]?._meta).toMatchObject({ ui: { visibility: ["app"] } });
            const resources = await client.listResources();
            expect(resources.resources).toContainEqual(
                expect.objectContaining({
                    uri: MOVIE_APP_URI,
                    mimeType: "text/html;profile=mcp-app",
                }),
            );

            const result = await client.callTool({
                name: "movie_search",
                arguments: { query: "ponyo" },
            });
            expect(result).toMatchObject({
                content: [
                    {
                        type: "text",
                        text: "Ponyo (2008) — A goldfish princess befriends a boy named Sōsuke.",
                    },
                    {
                        type: "resource_link",
                        uri: "https://en.wikipedia.org/wiki/Special:Search?search=Ponyo+Studio+Ghibli",
                        name: "Ponyo",
                        title: "Ponyo (2008)",
                        description: "A goldfish princess befriends a boy named Sōsuke.",
                        mimeType: "text/html",
                    },
                ],
                structuredContent: {
                    query: "ponyo",
                    position: 0,
                    resultCount: 1,
                    movie: {
                        title: "Ponyo",
                        originalTitle: "崖の上のポニョ",
                        runtimeMinutes: 101,
                        rating: 9.1,
                    },
                },
            });
        } finally {
            await client.close();
            await server.close();
        }
        expect(fetchCatalog).toHaveBeenCalledWith(
            GHIBLI_FILMS_URL,
            expect.objectContaining({
                headers: {
                    accept: "application/json",
                    "user-agent": "Happy2-Movie-Catalog/1.0",
                },
                signal: expect.any(AbortSignal),
            }),
        );
    });

    it("falls back to the complete catalog and clamps browsing to ten results", async () => {
        const rows = Array.from({ length: 12 }, (_, index) => ({
            id: String(index),
            title: `Film ${index}`,
            description: `Synopsis ${index}`,
        }));
        const result = await movieCatalogResult(response(rows), "no title matches", 9);
        expect(result.structuredContent).toMatchObject({
            position: 9,
            resultCount: 10,
            movie: { title: "Film 9" },
        });
    });

    it("returns a meaningful text error when the public catalog is empty", async () => {
        await expect(movieCatalogResult(response([]), "Totoro", 0)).resolves.toEqual({
            isError: true,
            content: [{ type: "text", text: "No movies matched “Totoro”." }],
        });
    });

    it("reports upstream HTTP errors without exposing a malformed result", async () => {
        await expect(movieCatalogResult(response({}, 503), "Totoro", 0)).rejects.toThrow(
            "Studio Ghibli catalog returned HTTP 503.",
        );
    });
});

function response(body: unknown, status = 200) {
    return vi.fn<CatalogFetch>(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }));
}
