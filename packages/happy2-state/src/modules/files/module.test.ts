import { describe, expect, it, vi } from "vitest";
import type { FileSummary } from "../../types.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import type { ClientTransport, HttpRequest, HttpResponse } from "../../transport.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { filesLoad } from "./filesLoad.js";
import { fileUpload } from "./fileUpload.js";
import { filesStoreCreateBinding } from "./filesStore.js";

describe("files module", () => {
    it("uploads an attachment through the typed file action", async () => {
        const uploaded = {
            id: "file-1",
            originalName: "note.txt",
            contentType: "text/plain",
            kind: "file" as const,
            size: 4,
            uploadedByUserId: "user-1",
            createdAt: "now",
        };
        const body = new FormData();
        body.append("file", new Blob(["note"], { type: "text/plain" }), "note.txt");
        const requests: HttpRequest[] = [];
        const transport: ClientTransport = {
            async request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
                requests.push(request);
                return { status: 200, body: { file: uploaded } as T };
            },
            subscribe: () => () => undefined,
        };
        const runtime = new StateRuntime({ transport });

        await expect(fileUpload({ runtime }, body)).resolves.toEqual(uploaded);
        expect(requests).toEqual([{ method: "POST", path: "/v0/files/upload", body }]);
        runtime.stop();
    });

    it("pages only with a cursor, deduplicates replacements, and preserves rows on page failure", async () => {
        const output = vi.fn();
        const files = filesStoreCreateBinding(output);
        files.store.filesMore();
        expect(output).not.toHaveBeenCalled();
        files.filesInput({
            type: "filesLoaded",
            files: [file("file-1", "old")],
            nextCursor: "cursor",
            append: false,
        });
        files.store.filesMore();
        expect(output).toHaveBeenCalledWith({ type: "filesMoreRequested" });

        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/files?before=cursor&limit=60",
            jsonResponse(200, { files: [file("file-1", "new"), file("file-2", "two")] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        await filesLoad({ runtime, files }, true);
        expect(files.store.get().files.map(({ originalName }) => originalName)).toEqual([
            "new",
            "two",
        ]);
        files.filesInput({ type: "filesLoaded", files: [], nextCursor: "next", append: false });
        server.respond(
            "GET",
            "/v0/files?before=next&limit=60",
            jsonResponse(500, { error: "bad" }),
        );
        await filesLoad({ runtime, files }, true);
        expect(files.store.get()).toMatchObject({ status: { type: "ready" }, files: [] });
        expect(files.store.get().pageError?.message).toBeTruthy();
        runtime.stop();
        files.dispose();
    });
});

function file(id: string, name: string): FileSummary {
    return {
        id,
        originalName: name,
        contentType: "text/plain",
        kind: "file",
        size: 1,
        uploadedByUserId: "user-1",
        createdAt: "now",
    };
}
