import { fireEvent, render, waitFor, within } from "@solidjs/testing-library";
import { createClientState } from "happy2-state";
import { createFakeServer, jsonResponse, type FakeServer } from "happy2-state/testing";
import { describe, expect, it } from "vitest";
import type { AuthSession } from "../components/AuthGate";
import { AdminView } from "./AdminView";
import { AgentImagesView } from "./AgentImagesView";

type ImageInput = {
    id: string;
    name: string;
    status: "pending" | "building" | "ready" | "failed";
    builtinKey?: "daycare-full" | "daycare-minimal";
    buildProgress?: number;
    lastBuildLogLine?: string;
    lastError?: string;
    createdAt?: string;
    updatedAt?: string;
};

function image(input: ImageInput) {
    return {
        id: input.id,
        name: input.name,
        definitionHash: `hash-${input.id}`,
        dockerTag: `happy2-agent:${input.id}`,
        status: input.status,
        buildAttempt: 1,
        buildProgress: input.buildProgress ?? 0,
        ...(input.builtinKey ? { builtinKey: input.builtinKey } : {}),
        ...(input.lastBuildLogLine ? { lastBuildLogLine: input.lastBuildLogLine } : {}),
        ...(input.lastError ? { lastError: input.lastError } : {}),
        createdAt: input.createdAt ?? "2026-07-13T09:00:00.000Z",
        updatedAt: input.updatedAt ?? "2026-07-13T09:00:00.000Z",
    };
}

function detail(
    input: ImageInput,
    extra: { dockerfile?: string; buildLog?: string; buildLogTruncated?: boolean } = {},
) {
    return {
        ...image(input),
        dockerfile: extra.dockerfile ?? "FROM happy2/agent-base:latest",
        buildLog: extra.buildLog ?? "",
        buildLogTruncated: extra.buildLogTruncated ?? false,
    };
}

const READY = image({ id: "img-ready", name: "Full toolchain", status: "ready" });
const PENDING = image({ id: "img-pending", name: "Rust nightly", status: "pending" });

function listResponse(images: ReturnType<typeof image>[], defaultImageId?: string) {
    return jsonResponse(200, {
        images,
        ...(defaultImageId ? { defaultImageId } : {}),
    });
}

function detailResponse(image: ReturnType<typeof detail>) {
    return jsonResponse(200, { image });
}

function mount(server: FakeServer, query?: string) {
    const state = createClientState(server.transport);
    const view = render(() => <AgentImagesView query={query} session={session(state)} />);
    return { state, view };
}

describe("AgentImagesView", () => {
    it("lists agent images with their status and default marker", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            listResponse(
                [
                    image({
                        id: "img-ready",
                        name: "Full toolchain",
                        status: "ready",
                        builtinKey: "daycare-full",
                    }),
                    PENDING,
                ],
                "img-ready",
            ),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Full toolchain")).toBeTruthy());
        expect(view.getByText("Rust nightly")).toBeTruthy();
        expect(view.getByText("Ready")).toBeTruthy();
        expect(view.getByText("Pending")).toBeTruthy();
        expect(view.getByText("Built-in")).toBeTruthy();
        // "Default" also names a column header, so assert it on the default row.
        expect(within(rowFor(view, "Full toolchain")).getByText("Default")).toBeTruthy();
        state.stop();
    });

    it("requests a build for a pending image and reflects the returned status", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentImages", listResponse([PENDING]));
        server.respond(
            "POST",
            "/v0/admin/agentImages/img-pending/buildImage",
            jsonResponse(202, {
                image: image({ id: "img-pending", name: "Rust nightly", status: "building" }),
            }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Rust nightly")).toBeTruthy());
        fireEvent.click(view.getByRole("button", { name: "Build" }));

        await waitFor(() => expect(view.getByText("Building")).toBeTruthy());
        expect(
            server.requests.some((r) => r.path === "/v0/admin/agentImages/img-pending/buildImage"),
        ).toBe(true);
        state.stop();
    });

    it("promotes a ready image to the default", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            listResponse(
                [READY, image({ id: "img-other", name: "Other", status: "ready" })],
                "img-other",
            ),
        );
        server.respond(
            "POST",
            "/v0/admin/agentImages/img-ready/setDefaultImage",
            jsonResponse(200, { defaultImageId: "img-ready", image: READY }),
        );
        const { state, view } = mount(server);

        // Two ready non-default? img-ready is non-default; img-other is default.
        const readyRow = await waitFor(() => rowFor(view, "Full toolchain"));
        fireEvent.click(within(readyRow).getByRole("button", { name: "Make default" }));

        await waitFor(() =>
            expect(within(rowFor(view, "Full toolchain")).getByText("Default")).toBeTruthy(),
        );
        expect(
            server.requests.some(
                (r) => r.path === "/v0/admin/agentImages/img-ready/setDefaultImage",
            ),
        ).toBe(true);
        state.stop();
    });

    it("creates a new image from a dockerfile and closes the dialog", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentImages", listResponse([]));
        server.respond(
            "POST",
            "/v0/admin/agentImages/createImage",
            jsonResponse(202, {
                image: image({ id: "img-new", name: "Python + Node", status: "pending" }),
            }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("No agent images yet")).toBeTruthy());
        // Both the header and the empty-state offer "New image"; use the header.
        fireEvent.click(view.getAllByRole("button", { name: "New image" })[0]!);

        const nameField = view.getByPlaceholderText("e.g. Python + Node toolchain");
        fireEvent.input(nameField, { target: { value: "Python + Node" } });
        const dockerfileField = view.getByPlaceholderText(/^FROM happy2\/agent-base/);
        fireEvent.input(dockerfileField, {
            target: { value: "FROM happy2/agent-base:latest\nRUN true" },
        });
        fireEvent.click(view.getByRole("button", { name: "Create image" }));

        await waitFor(() => expect(view.getByText("Python + Node")).toBeTruthy());
        // Dialog closed: the dockerfile field is gone.
        expect(view.queryByPlaceholderText("e.g. Python + Node toolchain")).toBeNull();
        const createRequest = server.requests.find(
            (r) => r.path === "/v0/admin/agentImages/createImage",
        );
        expect(createRequest?.body).toEqual({
            name: "Python + Node",
            dockerfile: "FROM happy2/agent-base:latest\nRUN true",
        });
        state.stop();
    });

    it("surfaces a load error instead of the table", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            jsonResponse(403, { error: "forbidden", message: "Server administrators only." }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Agent images unavailable")).toBeTruthy());
        expect(view.getByText("Server administrators only.")).toBeTruthy();
        state.stop();
    });

    it("surfaces a failed action without losing the row", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentImages", listResponse([PENDING]));
        server.respond(
            "POST",
            "/v0/admin/agentImages/img-pending/buildImage",
            jsonResponse(409, { error: "conflict", message: "Agent image is already building" }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Rust nightly")).toBeTruthy());
        fireEvent.click(view.getByRole("button", { name: "Build" }));

        await waitFor(() => expect(view.getByText("Action failed")).toBeTruthy());
        expect(view.getByText("Agent image is already building")).toBeTruthy();
        expect(view.getByText("Rust nightly")).toBeTruthy();
        state.stop();
    });

    it("updates live from a realtime agent-images hint, with no user action", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["agent-images"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        // The build transitions pending -> building on the server; the second
        // list read reflects it, exactly as the realtime refetch would receive.
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            listResponse([PENDING]),
            listResponse([image({ id: "img-pending", name: "Rust nightly", status: "building" })]),
        );
        const state = createClientState(server.transport);
        await state.start();
        const view = render(() => <AgentImagesView session={session(state)} />);

        await waitFor(() => expect(view.getByText("Pending")).toBeTruthy());

        // No click: a realtime hint alone drives the refetch and the update.
        server.events.sync({ sequence: "1", areas: ["agent-images"] });
        await waitFor(() => expect(view.getByText("Building")).toBeTruthy());
        expect(view.queryByText("Pending")).toBeNull();
        expect(server.requests.filter((r) => r.path === "/v0/admin/agentImages")).toHaveLength(2);
        state.stop();
    });

    it("shows the last build-log line and progress for a building image", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            listResponse([
                image({
                    id: "img-building",
                    name: "Python + Node",
                    status: "building",
                    buildProgress: 62,
                    lastBuildLogLine: "#6 [4/4] RUN pip install --no-cache-dir",
                }),
            ]),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Python + Node")).toBeTruthy());
        expect(view.getByText("#6 [4/4] RUN pip install --no-cache-dir")).toBeTruthy();
        expect(view.getByText("62%")).toBeTruthy();
        const bar = view.container.querySelector('[role="progressbar"]');
        expect(bar?.getAttribute("aria-valuenow")).toBe("62");
        state.stop();
    });

    it("opens the detail dialog with the Dockerfile and build log on row click", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentImages", listResponse([PENDING]));
        server.respond(
            "GET",
            "/v0/admin/agentImages/img-pending",
            detailResponse(
                detail(
                    { id: "img-pending", name: "Rust nightly", status: "pending" },
                    {
                        dockerfile: "FROM happy2/agent-base:latest\nRUN rustup default nightly",
                        buildLog: "#1 load build definition\n#2 pulling base image",
                    },
                ),
            ),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Rust nightly")).toBeTruthy());
        fireEvent.click(rowFor(view, "Rust nightly"));

        await waitFor(() => expect(view.getByText(/rustup default nightly/)).toBeTruthy());
        expect(view.getByText(/#2 pulling base image/)).toBeTruthy();
        // The modal title carries the image name.
        expect(view.container.querySelector('[data-happy2-ui="modal-title"]')?.textContent).toBe(
            "Rust nightly",
        );
        expect(server.requests.some((r) => r.path === "/v0/admin/agentImages/img-pending")).toBe(
            true,
        );
        state.stop();
    });

    it("streams the build log live in the open detail, with no user action", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["agent-images"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        const building = { id: "img-building", name: "Python + Node", status: "building" } as const;
        server.respond("GET", "/v0/admin/agentImages", listResponse([image(building)]));
        // First detail read has one log line; the live restream has the next one.
        server.respond(
            "GET",
            "/v0/admin/agentImages/img-building",
            detailResponse(detail(building, { buildLog: "#4 [2/4] apt-get install" })),
            detailResponse(
                detail(building, { buildLog: "#4 [2/4] apt-get install\n#6 [4/4] pip install" }),
            ),
        );
        const state = createClientState(server.transport);
        await state.start();
        const view = render(() => <AgentImagesView session={session(state)} />);

        await waitFor(() => expect(view.getByText("Python + Node")).toBeTruthy());
        fireEvent.click(rowFor(view, "Python + Node"));
        await waitFor(() => expect(view.getByText(/#4 \[2\/4\] apt-get install/)).toBeTruthy());

        // A realtime hint alone restreams the log into the open dialog.
        server.events.sync({ sequence: "1", areas: ["agent-images"] });
        await waitFor(() => expect(view.getByText(/#6 \[4\/4\] pip install/)).toBeTruthy());
        expect(
            server.requests.filter((r) => r.path === "/v0/admin/agentImages/img-building"),
        ).toHaveLength(2);
        state.stop();
    });

    it("filters images by the shared search query", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            listResponse([
                READY,
                image({ id: "img-pending", name: "Rust nightly", status: "pending" }),
            ]),
        );
        const { state, view } = mount(server, "rust");

        await waitFor(() => expect(view.getByText("Rust nightly")).toBeTruthy());
        expect(view.queryByText("Full toolchain")).toBeNull();
        state.stop();
    });
});

describe("AdminView agent images tab", () => {
    it("loads agent images when the tab is selected", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(200, { users: [] }));
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        server.respond("GET", "/v0/admin/agentImages", listResponse([READY], "img-ready"));
        const state = createClientState(server.transport);
        const view = render(() => <AdminView session={session(state)} />);

        await waitFor(() => expect(view.getByText("Admin")).toBeTruthy());
        // The images endpoint is lazy: untouched until the tab opens.
        expect(server.requests.some((r) => r.path === "/v0/admin/agentImages")).toBe(false);

        fireEvent.click(view.getByRole("tab", { name: /Agent images/ }));
        await waitFor(() => expect(view.getByText("Full toolchain")).toBeTruthy());
        state.stop();
    });
});

function rowFor(view: ReturnType<typeof render>, text: string): HTMLElement {
    const cell = view.getByText(text);
    const row = cell.closest('[data-happy2-ui="data-table-row"]');
    if (!(row instanceof HTMLElement)) throw new Error(`No table row for “${text}”.`);
    return row;
}

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
    };
}
