import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { searchQueryUpdate } from "./searchQueryUpdate.js";
import { searchStoreCreateBinding } from "./searchStore.js";

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
        const search = searchStoreCreateBinding(output);
        search.store.queryUpdate(" Report ");
        await searchQueryUpdate({ runtime, identities: new IdentityCatalog(), search }, " Report ");
        expect(search.store.get()).toMatchObject({
            query: " Report ",
            files: [{ id: "file-1" }],
            nextCursor: "cursor",
        });
        const snapshot = search.store.get();
        search.searchInput({ type: "searchLoaded", query: "other", results: [], files: [] });
        expect(search.store.get()).toBe(snapshot);
        search.store.queryUpdate("");
        await searchQueryUpdate({ runtime, identities: new IdentityCatalog(), search }, "");
        expect(search.store.get()).toMatchObject({
            results: { type: "ready", value: [] },
            files: [],
        });
        expect(output).toHaveBeenCalledWith({ type: "queryUpdated", query: "" });
        runtime.stop();
        search.dispose();
    });
});
