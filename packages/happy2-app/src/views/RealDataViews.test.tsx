import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createClientState, type FileSummary } from "happy2-state";
import { createFakeServer, jsonResponse } from "happy2-state/testing";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../components/AuthGate";
import { AdminView } from "./AdminView";
import { FilesView } from "./FilesView";
import { SearchOverlay } from "./SearchOverlay";

const file: FileSummary = {
    id: "file-1",
    kind: "file",
    originalName: "launch-brief.pdf",
    contentType: "application/pdf",
    size: 2_400,
    uploadedByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
};

describe("real data feature views", () => {
    it("combines server search results with real workspace files", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/search?q=launch&limit=50",
            jsonResponse(200, {
                results: [
                    {
                        type: "user",
                        score: 1,
                        user: {
                            id: "user-2",
                            firstName: "Grace",
                            lastName: "Hopper",
                            username: "grace",
                            role: "member",
                        },
                    },
                ],
            }),
        );
        server.respond("GET", "/v0/files?limit=100", jsonResponse(200, { files: [file] }));
        const state = createClientState(server.transport);
        const onSelect = vi.fn();
        const view = render(() => (
            <SearchOverlay onSelect={onSelect} query="launch" session={session(state)} />
        ));

        const fileRow = await waitFor(() => {
            const row = view.container.querySelector('[data-item-id="file-1"]');
            expect(row?.textContent).toContain("launch-brief.pdf");
            return row!;
        });
        expect(view.getByText("Grace Hopper")).toBeTruthy();
        expect(view.getByText("Files")).toBeTruthy();
        fireEvent.click(fileRow);
        expect(onSelect).toHaveBeenCalledWith("file", "file-1");
        state.stop();
    });

    it("lists authenticated files and gives each tile a working open action", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/files?limit=60", jsonResponse(200, { files: [file] }));
        const state = createClientState(server.transport);
        const onOpen = vi.fn();
        const view = render(() => <FilesView onOpen={onOpen} session={session(state)} />);

        await waitFor(() => expect(view.getByText("launch-brief.pdf")).toBeTruthy());
        fireEvent.click(view.getByRole("button", { name: /launch-brief\.pdf/i }));
        expect(onOpen).toHaveBeenCalledWith("file-1");
        state.stop();
    });

    it("shows a thumbhash while an authenticated image preview loads", async () => {
        const photo: FileSummary = {
            ...file,
            id: "photo-1",
            kind: "photo",
            originalName: "launch-photo.png",
            contentType: "image/png",
            thumbhash: "1fsrB38I9wiIh4hwj3CI-AiIgIAICIgA",
            width: 1200,
            height: 800,
        };
        const server = createFakeServer();
        server.respond("GET", "/v0/files?limit=60", jsonResponse(200, { files: [photo] }));
        const state = createClientState(server.transport);
        const view = render(() => <FilesView session={session(state)} />);

        const image = await waitFor(() => view.getByRole("img", { name: "launch-photo.png" }));
        expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
        expect(view.container.querySelector('[data-happy2-ui="media-glyph"]')).toBeNull();
        await waitFor(() =>
            expect(server.requests.some(({ path }) => path === "/v0/files/photo-1/thumbnail")).toBe(
                true,
            ),
        );
        state.stop();
    });

    it("replaces the thumbhash with an authenticated preview", async () => {
        const photo: FileSummary = {
            ...file,
            id: "photo-2",
            kind: "photo",
            originalName: "preview.png",
            contentType: "image/png",
            thumbhash: "1fsrB38I9wiIh4hwj3CI-AiIgIAICIgA",
        };
        const server = createFakeServer();
        server.respond("GET", "/v0/files?limit=60", jsonResponse(200, { files: [photo] }));
        server.respond(
            "GET",
            "/v0/files/photo-2/thumbnail",
            jsonResponse(404, { error: "not_found" }),
        );
        server.respond("GET", "/v0/files/photo-2/preview", {
            status: 200,
            body: new Uint8Array([1, 2, 3]).buffer,
            headers: { "content-type": "image/webp" },
        });
        const createObjectURL = vi.fn(() => "blob:authenticated-preview");
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
        const state = createClientState(server.transport);
        const view = render(() => <FilesView session={session(state)} />);

        await waitFor(() => view.getByRole("img", { name: "preview.png" }));
        await waitFor(() =>
            expect(view.getByRole("img", { name: "preview.png" }).getAttribute("src")).toBe(
                "blob:authenticated-preview",
            ),
        );
        expect(createObjectURL).toHaveBeenCalledOnce();
        expect(server.requests.some(({ path }) => path === "/v0/files/photo-2/preview")).toBe(true);
        view.unmount();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:authenticated-preview");
        state.stop();
        vi.unstubAllGlobals();
    });

    it("renders only live resources on the admin surface", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/users",
            jsonResponse(200, {
                users: [
                    {
                        id: "user-1",
                        firstName: "Ada",
                        lastName: "Lovelace",
                        username: "ada",
                        role: "admin",
                        lastAccessAt: "2026-01-01T00:00:00.000Z",
                    },
                ],
            }),
        );
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        const state = createClientState(server.transport);
        const view = render(() => <AdminView session={session(state)} />);

        await waitFor(() => expect(view.getByText("Ada Lovelace")).toBeTruthy());
        expect(view.getByText("@ada")).toBeTruthy();
        expect(view.getByText("Live workspace data")).toBeTruthy();
        state.stop();
    });
});

function session(state: ReturnType<typeof createClientState>): AuthSession {
    return {
        state,
        user: {
            id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
            username: "ada",
            email: "ada@example.com",
            kind: "human",
        },
        updateUser: () => undefined,
        setAvatar: async () => undefined,
    };
}
