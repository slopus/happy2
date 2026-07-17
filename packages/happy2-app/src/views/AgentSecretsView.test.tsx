import { fireEvent, render, waitFor, within } from "@solidjs/testing-library";
import { createClientState } from "happy2-state";
import { createFakeServer, jsonResponse, type FakeServer } from "happy2-state/testing";
import { describe, expect, it } from "vitest";
import type { AuthSession } from "../components/AuthGate";
import { AdminView } from "./AdminView";
import { AgentSecretsView } from "./AgentSecretsView";

type SecretInput = {
    id: string;
    description: string;
    environmentVariables: string[];
    agentUserIds?: string[];
    channelIds?: string[];
};

function secret(input: SecretInput) {
    return {
        id: input.id,
        description: input.description,
        environmentVariables: input.environmentVariables,
        agentUserIds: input.agentUserIds ?? [],
        channelIds: input.channelIds ?? [],
    };
}

const AGENT = {
    id: "agent-1",
    username: "secret_worker",
    firstName: "Secret",
    lastName: "Worker",
    role: "member",
    kind: "agent",
};
const HUMAN = {
    id: "human-1",
    username: "ada",
    firstName: "Ada",
    lastName: "Lovelace",
    role: "admin",
    kind: "human",
};
const CHANNEL = {
    id: "chan-1",
    kind: "public_channel",
    name: "Deployments",
    slug: "deployments",
    isListed: true,
    retentionMode: "inherit",
    defaultExpiryMode: "none",
    defaultAfterReadScope: "any_reader",
    lifecycleVersion: "1",
    createdByUserId: "human-1",
    pts: "1",
    lastMessageSequence: "0",
    membershipEpoch: "1",
    starred: false,
    lastReadSequence: "0",
    unreadCount: 0,
    mentionCount: 0,
    notificationLevel: "all",
    createdAt: "2026-07-13T09:00:00.000Z",
    updatedAt: "2026-07-13T09:00:00.000Z",
};

const SERVICE = secret({
    id: "service-api",
    description: "Service API credentials",
    environmentVariables: ["SERVICE_API_TOKEN", "SERVICE_API_REGION"],
});

function stubDirectory(server: FakeServer) {
    server.respond("GET", "/v0/contacts", jsonResponse(200, { users: [AGENT, HUMAN] }));
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [CHANNEL] }));
}

function mount(server: FakeServer, query?: string) {
    stubDirectory(server);
    const state = createClientState(server.transport);
    const view = render(() => <AgentSecretsView query={query} session={session(state)} />);
    return { state, view };
}

describe("AgentSecretsView", () => {
    it("lists secrets with their variable names and attachment counts", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentSecrets",
            jsonResponse(200, {
                secrets: [
                    secret({
                        id: "service-api",
                        description: "Service API credentials",
                        environmentVariables: ["SERVICE_API_TOKEN"],
                        agentUserIds: ["agent-1", "agent-2"],
                        channelIds: ["chan-1"],
                    }),
                ],
            }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Service API credentials")).toBeTruthy());
        expect(view.getByText("service-api")).toBeTruthy();
        expect(view.getByText("SERVICE_API_TOKEN")).toBeTruthy();
        const row = rowFor(view, "Service API credentials");
        // Two agents, one channel.
        expect(within(row).getByText("2")).toBeTruthy();
        expect(within(row).getByText("1")).toBeTruthy();
        state.stop();
    });

    it("creates a secret from an id, description, and a variable, sending values only to the server", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentSecrets", jsonResponse(200, { secrets: [] }));
        server.respond(
            "POST",
            "/v0/admin/agentSecrets/createSecret",
            jsonResponse(201, {
                secret: secret({
                    id: "service-api",
                    description: "Service API credentials",
                    environmentVariables: ["SERVICE_API_TOKEN"],
                }),
                sync: { sequence: "1" },
            }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("No agent secrets yet")).toBeTruthy());
        fireEvent.click(view.getAllByRole("button", { name: "New secret" })[0]!);

        fireEvent.input(view.getByPlaceholderText("e.g. service-api"), {
            target: { value: "service-api" },
        });
        fireEvent.input(view.getByPlaceholderText("e.g. Service API credentials"), {
            target: { value: "Service API credentials" },
        });
        fireEvent.input(view.getByPlaceholderText("NAME"), {
            target: { value: "SERVICE_API_TOKEN" },
        });
        fireEvent.input(view.getByPlaceholderText("value"), {
            target: { value: "super-secret-token" },
        });
        fireEvent.click(view.getByRole("button", { name: "Create secret" }));

        await waitFor(() => expect(view.getByText("Service API credentials")).toBeTruthy());
        // Dialog closed: the id field is gone.
        expect(view.queryByPlaceholderText("e.g. service-api")).toBeNull();
        const request = server.requests.find(
            (r) => r.path === "/v0/admin/agentSecrets/createSecret",
        );
        expect(request?.body).toEqual({
            id: "service-api",
            description: "Service API credentials",
            environment: { SERVICE_API_TOKEN: "super-secret-token" },
        });
        state.stop();
    });

    it("deletes a secret", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentSecrets", jsonResponse(200, { secrets: [SERVICE] }));
        server.respond(
            "POST",
            "/v0/admin/agentSecrets/service-api/deleteSecret",
            jsonResponse(200, { removed: true, sync: { sequence: "1" } }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Service API credentials")).toBeTruthy());
        const row = rowFor(view, "Service API credentials");
        fireEvent.click(within(row).getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(view.queryByText("Service API credentials")).toBeNull());
        expect(
            server.requests.some(
                (r) => r.path === "/v0/admin/agentSecrets/service-api/deleteSecret",
            ),
        ).toBe(true);
        state.stop();
    });

    it("opens the detail and attaches an agent from the picker", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentSecrets", jsonResponse(200, { secrets: [SERVICE] }));
        server.respond(
            "POST",
            "/v0/admin/agentSecrets/service-api/attachToAgent",
            jsonResponse(200, {
                secret: secret({
                    id: "service-api",
                    description: "Service API credentials",
                    environmentVariables: ["SERVICE_API_TOKEN", "SERVICE_API_REGION"],
                    agentUserIds: ["agent-1"],
                }),
                sync: { sequence: "1" },
            }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Service API credentials")).toBeTruthy());
        fireEvent.click(rowFor(view, "Service API credentials"));

        // The modal carries the description; the variables show as names.
        await waitFor(() =>
            expect(
                view.container.querySelector('[data-happy2-ui="modal-title"]')?.textContent,
            ).toBe("Service API credentials"),
        );
        const dialog = view.container.querySelector<HTMLElement>(
            '[data-happy2-ui="modal-dialog"]',
        )!;
        expect(within(dialog).getByText("SERVICE_API_REGION")).toBeTruthy();

        const picker = dialog.querySelector<HTMLSelectElement>(
            '[data-happy2-ui="agent-secret-detail-agents"] [data-happy2-ui="select-native"]',
        )!;
        fireEvent.change(picker, { target: { value: "agent-1" } });

        await waitFor(() => expect(within(dialog).getByText("Secret Worker")).toBeTruthy());
        const request = server.requests.find(
            (r) => r.path === "/v0/admin/agentSecrets/service-api/attachToAgent",
        );
        expect(request?.body).toEqual({ agentUserId: "agent-1" });
        state.stop();
    });

    it("surfaces a load error instead of the table", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentSecrets",
            jsonResponse(403, { error: "forbidden", message: "Server administrators only." }),
        );
        const { state, view } = mount(server);

        await waitFor(() => expect(view.getByText("Agent secrets unavailable")).toBeTruthy());
        expect(view.getByText("Server administrators only.")).toBeTruthy();
        state.stop();
    });

    it("updates live from a realtime agent-secrets hint, with no user action", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["agent-secrets"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        server.respond(
            "GET",
            "/v0/admin/agentSecrets",
            jsonResponse(200, { secrets: [] }),
            jsonResponse(200, { secrets: [SERVICE] }),
        );
        stubDirectory(server);
        const state = createClientState(server.transport);
        await state.start();
        const view = render(() => <AgentSecretsView session={session(state)} />);

        await waitFor(() => expect(view.getByText("No agent secrets yet")).toBeTruthy());

        // No click: a realtime hint alone drives the refetch and the update.
        server.events.sync({ sequence: "1", areas: ["agent-secrets"] });
        await waitFor(() => expect(view.getByText("Service API credentials")).toBeTruthy());
        expect(server.requests.filter((r) => r.path === "/v0/admin/agentSecrets")).toHaveLength(2);
        state.stop();
    });

    it("filters secrets by the shared search query", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/agentSecrets",
            jsonResponse(200, {
                secrets: [
                    SERVICE,
                    secret({
                        id: "openai",
                        description: "OpenAI organization key",
                        environmentVariables: ["OPENAI_API_KEY"],
                    }),
                ],
            }),
        );
        const { state, view } = mount(server, "openai");

        await waitFor(() => expect(view.getByText("OpenAI organization key")).toBeTruthy());
        expect(view.queryByText("Service API credentials")).toBeNull();
        state.stop();
    });
});

describe("AdminView agent secrets tab", () => {
    it("loads agent secrets when the tab is selected", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(200, { users: [] }));
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        server.respond("GET", "/v0/admin/agentSecrets", jsonResponse(200, { secrets: [SERVICE] }));
        stubDirectory(server);
        const state = createClientState(server.transport);
        const view = render(() => <AdminView session={session(state)} />);

        await waitFor(() => expect(view.getByText("Admin")).toBeTruthy());
        // The secrets endpoint is lazy: untouched until the tab opens.
        expect(server.requests.some((r) => r.path === "/v0/admin/agentSecrets")).toBe(false);

        fireEvent.click(view.getByRole("tab", { name: /Agent secrets/ }));
        await waitFor(() => expect(view.getByText("Service API credentials")).toBeTruthy());
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
            id: "human-1",
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
