import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { searchQueryUpdate } from "./searchState.js";
import { searchStoreCreate } from "./searchState.js";

describe("search module", () => {
    it("normalizes queries, filters files, ignores mismatched input, and clears empty search", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/search?q=Report&limit=50",
            jsonResponse(200, { results: [], nextCursor: "cursor" }),
        );
        server.respond(
            "GET",
            "/v0/files?limit=100",
            jsonResponse(200, {
                files: [
                    {
                        id: "file-1",
                        kind: "file",
                        originalName: "Quarterly Report.txt",
                        contentType: "text/plain",
                        size: 1,
                        uploadedByUserId: "user-1",
                        createdAt: "now",
                    },
                ],
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const output = vi.fn();
        const search = searchStoreCreate(output);
        search.getState().queryUpdate(" Report ");
        await searchQueryUpdate({ runtime, identities: new IdentityCatalog(), search }, " Report ");
        expect(search.getState()).toMatchObject({
            query: " Report ",
            files: [{ id: "file-1" }],
            nextCursor: "cursor",
        });
        const snapshot = search.getState();
        search
            .getState()
            .searchInput({ type: "searchLoaded", query: "other", results: [], files: [] });
        expect(search.getState()).toBe(snapshot);
        search.getState().queryUpdate("");
        await searchQueryUpdate({ runtime, identities: new IdentityCatalog(), search }, "");
        expect(search.getState()).toMatchObject({
            results: { type: "ready", value: [] },
            files: [],
        });
        expect(output).toHaveBeenCalledWith({ type: "queryUpdated", query: "" });
        runtime.stop();
    });
});
