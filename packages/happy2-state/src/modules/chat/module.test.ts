import { describe, expect, it, vi } from "vitest";
import type {
    DocumentWriteRequestSummary,
    PluginManagementRequestSummary,
    PortShareSummary,
} from "../../resources.js";
import { UserError } from "../../types.js";
import { chat, message } from "../../../tests/fixtures.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { composerStoreCreate } from "../composer/composerState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { chatLoad } from "./chatState.js";
import { chatMembersLoad } from "./chatState.js";
import { chatPluginRequestDecide, chatPluginRequestsLoad } from "./chatState.js";
import { chatDocumentWriteRequestDecide, chatDocumentWriteRequestsLoad } from "./chatState.js";
import {
    chatPortShareDisable,
    chatPortShareOpen,
    chatPortSharesLoad,
    type PortShareAccessTarget,
} from "./chatState.js";
import { chatStoreCreate } from "./chatState.js";
import { messageItemProject } from "./chatState.js";

describe("chat module", () => {
    it("hydrates chat effort on load and follows retained effort service messages", async () => {
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        const identities = new IdentityCatalog();
        const summary = chat({ defaultAgentUserId: "agent-1" });
        const initialNotice = message({
            id: "effort-high",
            sequence: "1",
            kind: "automated",
            text: "@agent's reasoning effort changed to high",
            service: { type: "agent_effort_changed", agentUserId: "agent-1", effort: "high" },
        });
        const runtime = {
            active: true,
            connected: true,
            operation: vi.fn(async (name: string) => {
                if (name === "getChat") return { chat: summary };
                if (name === "getMessages") return { messages: [initialNotice], hasMore: false };
                throw new Error(`Unexpected operation: ${name}`);
            }),
        } as unknown as StateRuntime;

        await chatLoad(
            {
                runtime,
                identities,
                chatGet: () => binding,
                agentUserIds: (loaded) => [loaded.defaultAgentUserId!],
            },
            summary.id,
        );

        expect(output).toHaveBeenCalledWith({
            type: "agentEffortRetained",
            chatId: summary.id,
            agentUserId: "agent-1",
        });
        expect(binding.getState().agentEffort["agent-1"]).toEqual({ type: "loading" });

        // A notice that arrived before the effort HTTP request settled wins over
        // that stale request result, then later service messages keep it synced.
        binding.getState().chatInput({
            type: "agentEffortLoaded",
            value: {
                agentUserId: "agent-1",
                effort: "low",
                options: ["low", "high", "xhigh"],
            },
        });
        expect(binding.getState().agentEffort["agent-1"]).toMatchObject({
            type: "ready",
            value: { effort: "high" },
        });
        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(
                identities,
                message({
                    id: "effort-xhigh",
                    sequence: "2",
                    kind: "automated",
                    text: "@agent's reasoning effort changed to xhigh",
                    service: {
                        type: "agent_effort_changed",
                        agentUserId: "agent-1",
                        effort: "xhigh",
                    },
                }),
            ),
        });
        expect(binding.getState().agentEffort["agent-1"]).toMatchObject({
            type: "ready",
            value: { effort: "xhigh" },
        });
    });

    it("owns every retained conversation resource in one coarse store", () => {
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        binding.getState().membersRetain();
        binding.getState().membersRetain();
        binding.getState().pinsRetain();
        binding.getState().reactionActorsRetain("message-1", "emoji:👍");
        binding.getState().agentEffortRetain("agent-1");
        binding.getState().agentEffortChange("agent-1", "high");
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "membersRetained",
            "pinsRetained",
            "reactionActorsRetained",
            "agentEffortRetained",
            "agentEffortSubmitted",
        ]);

        const identities = new IdentityCatalog();
        const item = messageItemProject(identities, message());
        binding.getState().chatInput({
            type: "chatLoaded",
            chat: chat(),
            messages: [item],
            hasMoreMessages: true,
        });
        const ready = binding.getState();
        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(identities, message()),
        });
        expect(binding.getState()).toBe(ready);
        binding.getState().chatInput({
            type: "membersLoaded",
            members: [
                {
                    id: "user-1",
                    username: "ada",
                    displayName: "Ada",
                    kind: "human",
                    role: "member",
                    presence: "online",
                },
            ],
        });
        binding.getState().chatInput({ type: "pinsFailed", error: new UserError("pins") });
        binding.getState().chatInput({
            type: "reactionActorsLoaded",
            details: { messageId: "message-1", reactionKey: "emoji:👍", actors: [] },
        });
        binding.getState().chatInput({
            type: "typingReconciled",
            typing: [{ chatId: "chat-1", userId: "user-1", expiresAt: 10 }],
        });
        binding.getState().chatInput({
            type: "agentActivityReconciled",
            agentActivity: [
                {
                    chatId: "chat-1",
                    agentUserId: "agent-1",
                    turnId: "turn-1",
                    phase: "thinking",
                    tokenCount: 1,
                    startedAt: 0,
                    subagents: [],
                    backgroundTerminals: [],
                    expiresAt: 10,
                },
            ],
        });
        expect(binding.getState()).toMatchObject({
            status: { type: "ready" },
            members: { type: "ready" },
            pins: { type: "error" },
            typing: [{ userId: "user-1" }],
            agentActivity: [{ agentUserId: "agent-1" }],
        });
        binding.getState().chatInput({ type: "messageRemoved", messageId: "message-1" });
        expect(binding.getState().messages).toEqual([]);
        binding.getState().membersRetain();
        expect(output).toHaveBeenCalledTimes(5);
    });

    it("loads canonical members into the retained store", async () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({
            type: "chatLoaded",
            chat: chat({ ownerUserId: "user-1" }),
            messages: [],
            hasMoreMessages: false,
        });
        const runtime = {
            connected: true,
            operation: vi.fn().mockResolvedValue({
                users: [
                    {
                        id: "user-1",
                        username: "ada",
                        firstName: "Ada",
                        role: "member",
                        kind: "human",
                    },
                ],
                memberships: [],
            }),
        } as unknown as StateRuntime;
        const composer = composerStoreCreate("chat-1", {
            audience: "agents",
            agentUserIds: ["agent-removed"],
        });
        await chatMembersLoad(
            {
                runtime,
                identities: new IdentityCatalog(),
                chatGet: () => binding,
                composerGet: () => composer,
                presenceGet: () => ({ userId: "user-1", status: "online", connectionCount: 1 }),
            },
            "chat-1",
        );
        expect(binding.getState().members).toMatchObject({
            type: "ready",
            value: [{ role: "owner", displayName: "Ada", presence: "online" }],
        });
        expect(composer.getState().agentUserIds).toEqual([]);
    });

    it("reconciles a durable effort service message into only an already retained control", () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({
            type: "agentEffortLoaded",
            value: {
                agentUserId: "agent-1",
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
            },
        });
        const serviceItem = messageItemProject(
            new IdentityCatalog(),
            message({
                id: "effort-message-2",
                sequence: "2",
                kind: "automated",
                text: "@agent's reasoning effort changed to low",
                service: {
                    type: "agent_effort_changed",
                    agentUserId: "agent-1",
                    effort: "low",
                },
            }),
        );
        binding.getState().chatInput({ type: "messageUpserted", item: serviceItem });
        expect(binding.getState().agentEffort).toEqual({
            "agent-1": {
                type: "ready",
                value: {
                    agentUserId: "agent-1",
                    effort: "low",
                    options: ["low", "medium", "high", "xhigh"],
                },
            },
        });

        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(
                new IdentityCatalog(),
                message({
                    id: "effort-message-1",
                    sequence: "1",
                    kind: "automated",
                    text: "@agent's reasoning effort changed to medium",
                    service: {
                        type: "agent_effort_changed",
                        agentUserId: "agent-1",
                        effort: "medium",
                    },
                }),
            ),
        });
        expect(binding.getState().agentEffort["agent-1"]).toMatchObject({
            type: "ready",
            value: { effort: "low" },
        });

        binding.getState().chatInput({
            type: "messageUpserted",
            item: messageItemProject(
                new IdentityCatalog(),
                message({
                    id: "other-agent-effort",
                    sequence: "3",
                    kind: "automated",
                    service: {
                        type: "agent_effort_changed",
                        agentUserId: "agent-2",
                        effort: "xhigh",
                    },
                }),
            ),
        });
        expect(binding.getState().agentEffort["agent-2"]).toBeUndefined();
    });

    it("retains durable channel lifecycle service messages across reconciliation", () => {
        const binding = chatStoreCreate("chat-1");
        const identities = new IdentityCatalog();
        const lifecycle = [
            message({
                id: "joined-1",
                sequence: "1",
                kind: "automated",
                text: "@ada joined #ops",
                service: { type: "user_joined", userId: "user-2" },
            }),
            message({
                id: "left-1",
                sequence: "2",
                kind: "automated",
                text: "@ada left #ops",
                service: { type: "user_left", userId: "user-2" },
            }),
            message({
                id: "kicked-1",
                sequence: "3",
                kind: "automated",
                text: "@ada was removed from #ops",
                service: { type: "user_kicked", userId: "user-2" },
            }),
            message({
                id: "archived-1",
                sequence: "4",
                kind: "automated",
                text: "@owner archived #ops",
                service: { type: "channel_archived", userId: "user-1" },
            }),
        ].map((entry) => messageItemProject(identities, entry));
        binding.getState().chatInput({
            type: "chatLoaded",
            chat: chat(),
            messages: lifecycle,
            hasMoreMessages: false,
        });
        // A later reconciliation of the same durable notice must not drop any lifecycle payload.
        binding.getState().chatInput({ type: "messageUpserted", item: lifecycle[2] });
        expect(binding.getState().messages.map((item) => item.message.service)).toEqual([
            { type: "user_joined", userId: "user-2" },
            { type: "user_left", userId: "user-2" },
            { type: "user_kicked", userId: "user-2" },
            { type: "channel_archived", userId: "user-1" },
        ]);
        expect(binding.getState().messages.map((item) => item.message.text)).toEqual([
            "@ada joined #ops",
            "@ada left #ops",
            "@ada was removed from #ops",
            "@owner archived #ops",
        ]);
    });
});

const pendingRequest: PluginManagementRequestSummary = {
    id: "request1",
    action: "install",
    status: "pending",
    chatId: "chat-1",
    agentUserId: "agent-1",
    displayName: "Chat Helper",
    shortName: "chat-helper",
    description: "Adds a helper skill.",
    reason: "The user asked for it.",
    sourceKind: "link",
    sourceReference: "https://plugins.example/chat-helper.zip",
    createdAt: "2026-01-01T00:00:00.000Z",
};

describe("chat plugin management requests", () => {
    it("retains once, loads durably, and scopes each decision to the exact pending request", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/pluginManagementRequests",
            jsonResponse(200, { requests: [pendingRequest] }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/pluginManagementRequests/request1/approvePluginInstall",
            jsonResponse(200, {
                approval: {
                    ...pendingRequest,
                    status: "approved",
                    resolvedAt: "2026-01-01T00:01:00.000Z",
                    installationId: "installation-9",
                },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        binding.getState().pluginRequestsRetain();
        binding.getState().pluginRequestsRetain();
        expect(
            output.mock.calls.filter(([event]) => event.type === "pluginRequestsRetained"),
        ).toHaveLength(1);
        expect(binding.getState().pluginRequests.type).toBe("loading");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPluginRequestsLoad(context, "chat-1");
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ id: "request1", status: "pending" }],
        });

        // A decision for an unknown or non-pending request never leaves the store.
        binding.getState().pluginRequestApprove("missing");
        binding.getState().pluginRequestApprove("request1");
        // A repeated decision while the first is in flight stays local.
        binding.getState().pluginRequestDeny("request1");
        const decisions = output.mock.calls
            .map(([event]) => event)
            .filter(({ type }) => type === "pluginRequestDecisionSubmitted");
        expect(decisions).toEqual([
            {
                type: "pluginRequestDecisionSubmitted",
                chatId: "chat-1",
                requestId: "request1",
                action: "install",
                decision: "approve",
            },
        ]);
        expect(binding.getState().pluginRequestPendingIds).toEqual(["request1"]);

        const pluginsReconcile = vi.fn();
        await chatPluginRequestDecide(
            { runtime, chatGet: () => binding, pluginsReconcile },
            decisions[0] as never,
        );
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ id: "request1", status: "approved", installationId: "installation-9" }],
        });
        expect(binding.getState().pluginRequestPendingIds).toEqual([]);
        expect(pluginsReconcile).toHaveBeenCalledTimes(1);
        expect(
            server.requests.filter((request) => request.method === "POST").map(({ path }) => path),
        ).toEqual(["/v0/chats/chat-1/pluginManagementRequests/request1/approvePluginInstall"]);
        runtime.stop();
    });

    it("keeps a ready list on screen when a reconcile read fails, and surfaces decision failures", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/pluginManagementRequests",
            jsonResponse(200, { requests: [{ ...pendingRequest, action: "uninstall" }] }),
            jsonResponse(500, { error: "internal", message: "boom" }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/pluginManagementRequests/request1/denyPluginUninstall",
            jsonResponse(409, { error: "conflict", message: "Request is no longer pending" }),
        );
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
        });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        binding.getState().pluginRequestsRetain();
        await chatPluginRequestsLoad(context, "chat-1");
        expect(binding.getState().pluginRequests.type).toBe("ready");
        await chatPluginRequestsLoad(context, "chat-1");
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ id: "request1" }],
        });

        binding.getState().pluginRequestDeny("request1");
        const decision = output.mock.calls
            .map(([event]) => event)
            .find(({ type }) => type === "pluginRequestDecisionSubmitted");
        expect(decision).toMatchObject({ action: "uninstall", decision: "deny" });
        const pluginsReconcile = vi.fn();
        await chatPluginRequestDecide(
            { runtime, chatGet: () => binding, pluginsReconcile },
            decision as never,
        );
        expect(binding.getState().pluginRequestPendingIds).toEqual([]);
        expect(binding.getState().pluginRequestActionError?.message).toBe(
            "Request is no longer pending",
        );
        expect(pluginsReconcile).not.toHaveBeenCalled();
        // The next decision intent clears the surfaced error.
        binding.getState().pluginRequestApprove("request1");
        expect(binding.getState().pluginRequestActionError).toBeUndefined();
        runtime.stop();
    });

    it("prunes local busy markers when a durable reload shows a decision resolved elsewhere", () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({ type: "pluginRequestsLoading" });
        binding.getState().chatInput({
            type: "pluginRequestsLoaded",
            requests: [pendingRequest],
        });
        binding.getState().pluginRequestApprove("request1");
        expect(binding.getState().pluginRequestPendingIds).toEqual(["request1"]);
        binding.getState().chatInput({
            type: "pluginRequestsLoaded",
            requests: [{ ...pendingRequest, status: "denied" }],
        });
        expect(binding.getState().pluginRequestPendingIds).toEqual([]);
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ status: "denied" }],
        });
    });

    it("drops a stale overlapping reload that lands after a newer durable read", async () => {
        const server = createFakeServer();
        const pendingResponses: Array<(response: ReturnType<typeof jsonResponse>) => void> = [];
        server.route(
            "GET",
            "/v0/chats/chat-1/pluginManagementRequests",
            () => new Promise((resolve) => pendingResponses.push(resolve)),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        const staleRead = chatPluginRequestsLoad(context, "chat-1");
        const freshRead = chatPluginRequestsLoad(context, "chat-1");
        expect(pendingResponses).toHaveLength(2);
        // The newer read resolves first with the terminal request.
        pendingResponses[1]!(
            jsonResponse(200, { requests: [{ ...pendingRequest, status: "approved" }] }),
        );
        await freshRead;
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ status: "approved" }],
        });
        // The older read then lands with the outdated pending list and is dropped.
        pendingResponses[0]!(jsonResponse(200, { requests: [pendingRequest] }));
        await staleRead;
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ status: "approved" }],
        });
        runtime.stop();
    });

    it("keeps a direct decision result over an older in-flight list read", async () => {
        const server = createFakeServer();
        const pendingResponses: Array<(response: ReturnType<typeof jsonResponse>) => void> = [];
        server.route("GET", "/v0/chats/chat-1/pluginManagementRequests", (_, { requestNumber }) =>
            requestNumber === 1
                ? jsonResponse(200, { requests: [pendingRequest] })
                : new Promise((resolve) => pendingResponses.push(resolve)),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/pluginManagementRequests/request1/approvePluginInstall",
            jsonResponse(200, {
                approval: {
                    ...pendingRequest,
                    status: "approved",
                    resolvedAt: "2026-01-01T00:01:00.000Z",
                    installationId: "installation-9",
                },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPluginRequestsLoad(context, "chat-1");
        // A hinted reload starts and hangs while the human decides.
        const staleRead = chatPluginRequestsLoad(context, "chat-1");
        binding.getState().pluginRequestApprove("request1");
        const decision = output.mock.calls
            .map(([event]) => event)
            .find(({ type }) => type === "pluginRequestDecisionSubmitted");
        await chatPluginRequestDecide(
            { runtime, chatGet: () => binding, pluginsReconcile: () => undefined },
            decision as never,
        );
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ status: "approved", installationId: "installation-9" }],
        });
        // The read that predates the decision then lands with the request still
        // pending; it must not regress the terminal card to actionable state.
        pendingResponses[0]!(jsonResponse(200, { requests: [pendingRequest] }));
        await staleRead;
        expect(binding.getState().pluginRequests).toMatchObject({
            type: "ready",
            value: [{ status: "approved", installationId: "installation-9" }],
        });
        expect(binding.getState().pluginRequestPendingIds).toEqual([]);
        runtime.stop();
    });

    it("preserves references for unchanged requests across reconciliation reads", () => {
        const binding = chatStoreCreate("chat-1");
        const other: PluginManagementRequestSummary = {
            ...pendingRequest,
            id: "request2",
            action: "uninstall",
            targetInstallationId: "installation-1",
        };
        binding.getState().chatInput({
            type: "pluginRequestsLoaded",
            requests: [pendingRequest, other],
        });
        const before = binding.getState().pluginRequests;
        const firstBefore = before.type === "ready" ? before.value[0] : undefined;
        // An identical payload keeps the whole loadable reference.
        binding.getState().chatInput({
            type: "pluginRequestsLoaded",
            requests: [{ ...pendingRequest }, { ...other }],
        });
        expect(binding.getState().pluginRequests).toBe(before);
        // Changing one request replaces only that entry's reference.
        binding.getState().chatInput({
            type: "pluginRequestsLoaded",
            requests: [{ ...pendingRequest }, { ...other, status: "approved" }],
        });
        const after = binding.getState().pluginRequests;
        expect(after).not.toBe(before);
        expect(after.type === "ready" ? after.value[0] : undefined).toBe(firstBefore);
        expect(after).toMatchObject({
            type: "ready",
            value: [{ id: "request1" }, { id: "request2", status: "approved" }],
        });
    });
});

const pendingWriteRequest: DocumentWriteRequestSummary = {
    id: "write1",
    status: "pending",
    chatId: "chat-1",
    agentUserId: "agent-1",
    requesterInstallationId: "installation-1",
    documentId: "doc-1",
    documentTitle: "Launch plan",
    clientUpdateId: "update-1",
    expiresAt: "2026-01-01T00:05:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("chat document write requests", () => {
    it("retains once, loads durably, and scopes each decision to the exact pending request", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/documentWriteRequests",
            jsonResponse(200, { requests: [pendingWriteRequest] }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/documentWriteRequests/write1/approveDocumentWrite",
            jsonResponse(200, {
                request: {
                    ...pendingWriteRequest,
                    status: "approved",
                    resolvedByUserId: "user-1",
                    resolvedAt: "2026-01-01T00:01:00.000Z",
                    acceptedSequence: "42",
                },
                acceptedSequence: "42",
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        binding.getState().documentWriteRequestsRetain();
        binding.getState().documentWriteRequestsRetain();
        expect(
            output.mock.calls.filter(([event]) => event.type === "documentWriteRequestsRetained"),
        ).toHaveLength(1);
        expect(binding.getState().documentWriteRequests.type).toBe("loading");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatDocumentWriteRequestsLoad(context, "chat-1");
        expect(binding.getState().documentWriteRequests).toMatchObject({
            type: "ready",
            value: [{ id: "write1", status: "pending" }],
        });

        // A decision for an unknown or non-pending request never leaves the store.
        binding.getState().documentWriteRequestApprove("missing");
        binding.getState().documentWriteRequestApprove("write1");
        // A repeated decision while the first is in flight stays local.
        binding.getState().documentWriteRequestDeny("write1");
        const decisions = output.mock.calls
            .map(([event]) => event)
            .filter(({ type }) => type === "documentWriteRequestDecisionSubmitted");
        expect(decisions).toEqual([
            {
                type: "documentWriteRequestDecisionSubmitted",
                chatId: "chat-1",
                requestId: "write1",
                decision: "approve",
            },
        ]);
        expect(binding.getState().documentWriteRequestPendingIds).toEqual(["write1"]);

        await chatDocumentWriteRequestDecide(
            { runtime, chatGet: () => binding },
            decisions[0] as never,
        );
        expect(binding.getState().documentWriteRequests).toMatchObject({
            type: "ready",
            value: [{ id: "write1", status: "approved", acceptedSequence: "42" }],
        });
        expect(binding.getState().documentWriteRequestPendingIds).toEqual([]);
        expect(
            server.requests.filter((request) => request.method === "POST").map(({ path }) => path),
        ).toEqual(["/v0/chats/chat-1/documentWriteRequests/write1/approveDocumentWrite"]);
        runtime.stop();
    });

    it("surfaces a decision failure and clears it on the next decision intent", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/documentWriteRequests",
            jsonResponse(200, { requests: [pendingWriteRequest] }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/documentWriteRequests/write1/denyDocumentWrite",
            jsonResponse(409, { error: "conflict", message: "Request is no longer pending" }),
        );
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
        });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        binding.getState().documentWriteRequestsRetain();
        await chatDocumentWriteRequestsLoad(context, "chat-1");

        binding.getState().documentWriteRequestDeny("write1");
        const decision = output.mock.calls
            .map(([event]) => event)
            .find(({ type }) => type === "documentWriteRequestDecisionSubmitted");
        expect(decision).toMatchObject({ decision: "deny" });
        await chatDocumentWriteRequestDecide(
            { runtime, chatGet: () => binding },
            decision as never,
        );
        expect(binding.getState().documentWriteRequestPendingIds).toEqual([]);
        expect(binding.getState().documentWriteRequestActionError?.message).toBe(
            "Request is no longer pending",
        );
        // The request stays actionable, and the next intent clears the error.
        binding.getState().documentWriteRequestApprove("write1");
        expect(binding.getState().documentWriteRequestActionError).toBeUndefined();
        expect(binding.getState().documentWriteRequestPendingIds).toEqual(["write1"]);
        runtime.stop();
    });

    it("prunes local busy markers when a durable reload shows a decision resolved elsewhere", () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({ type: "documentWriteRequestsLoading" });
        binding.getState().chatInput({
            type: "documentWriteRequestsLoaded",
            requests: [pendingWriteRequest],
        });
        binding.getState().documentWriteRequestApprove("write1");
        expect(binding.getState().documentWriteRequestPendingIds).toEqual(["write1"]);
        binding.getState().chatInput({
            type: "documentWriteRequestsLoaded",
            requests: [{ ...pendingWriteRequest, status: "denied" }],
        });
        expect(binding.getState().documentWriteRequestPendingIds).toEqual([]);
        expect(binding.getState().documentWriteRequests).toMatchObject({
            type: "ready",
            value: [{ status: "denied" }],
        });
    });
});

const sampleShare: PortShareSummary = {
    id: "share-1",
    chatId: "chat-1",
    agentUserId: "agent-1",
    containerPort: 3000,
    name: "Documentation Preview",
    subdomain: "documentation-preview-abc123",
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    url: "http://documentation-preview-abc123.preview.example",
};

describe("chat port shares", () => {
    it("retains once, loads durably, and exposes the active share to both surfaces", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        binding.getState().portSharesRetain();
        binding.getState().portSharesRetain();
        expect(
            output.mock.calls.filter(([event]) => event.type === "portSharesRetained"),
        ).toHaveLength(1);
        expect(binding.getState().portShares.type).toBe("loading");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        expect(binding.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1", name: "Documentation Preview", containerPort: 3000 }],
        });
        runtime.stop();
    });

    it("opens a share by issuing a scoped token, exchanging it, and navigating the reserved window", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
        );
        server.respond(
            "POST",
            "/v0/portShares/share-1/createAccessToken",
            jsonResponse(200, {
                token: "scoped-token",
                expiresAt: "2026-01-01T01:00:00.000Z",
                refreshAfter: "2026-01-01T00:15:00.000Z",
                portShare: sampleShare,
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");

        const navigate = vi.fn(async () => undefined);
        const exchange = vi.fn(async () => undefined);
        const release = vi.fn();
        const target: PortShareAccessTarget = { navigate, exchange, release, closed: false };
        const portShareLeaseStart = vi.fn();
        binding.getState().portShareOpen("share-1");
        expect(binding.getState().portShareOpeningIds).toEqual(["share-1"]);
        await chatPortShareOpen({ ...context, portShareLeaseStart }, "chat-1", "share-1", target);
        expect(navigate).toHaveBeenCalledWith(
            "http://documentation-preview-abc123.preview.example",
            "scoped-token",
        );
        expect(release).not.toHaveBeenCalled();
        expect(binding.getState().portShareOpeningIds).toEqual([]);
        expect(binding.getState().portShareActionError).toBeUndefined();
        // The scoped token is never persisted into any snapshot field.
        expect(JSON.stringify(binding.getState().portShares)).not.toContain("scoped-token");
        // A successful open starts the refresh lease from the server refreshAfter.
        expect(portShareLeaseStart).toHaveBeenCalledWith({
            chatId: "chat-1",
            portShareId: "share-1",
            url: "http://documentation-preview-abc123.preview.example",
            refreshAfter: "2026-01-01T00:15:00.000Z",
            target,
        });
        runtime.stop();
    });

    it("reports a blocked pop-up as a displayable failure without issuing a token", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        binding.getState().portShareOpen("share-1");
        await chatPortShareOpen(context, "chat-1", "share-1", null);
        expect(binding.getState().portShareOpeningIds).toEqual([]);
        expect(binding.getState().portShareActionError?.message).toContain("pop-ups");
        // No access-token request left the client.
        expect(server.requests.some((request) => request.path.includes("createAccessToken"))).toBe(
            false,
        );
        runtime.stop();
    });

    it("releases the reserved window and surfaces the error when the exchange fails", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
        );
        server.respond(
            "POST",
            "/v0/portShares/share-1/createAccessToken",
            jsonResponse(200, {
                token: "scoped-token",
                expiresAt: "2026-01-01T01:00:00.000Z",
                refreshAfter: "2026-01-01T00:15:00.000Z",
                portShare: sampleShare,
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        const release = vi.fn();
        const target: PortShareAccessTarget = {
            navigate: vi.fn(async () => {
                throw new UserError("The shared preview did not accept the session.");
            }),
            exchange: vi.fn(async () => undefined),
            release,
            closed: false,
        };
        binding.getState().portShareOpen("share-1");
        await chatPortShareOpen(context, "chat-1", "share-1", target);
        expect(release).toHaveBeenCalledTimes(1);
        expect(binding.getState().portShareOpeningIds).toEqual([]);
        expect(binding.getState().portShareActionError?.message).toBe(
            "The shared preview did not accept the session.",
        );
        runtime.stop();
    });

    it("disables a share optimistically and reconciles its removal from the durable list", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
            jsonResponse(200, { portShares: [] }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/portShares/share-1/disablePortShare",
            jsonResponse(200, {
                portShare: { ...sampleShare, disabledAt: "2026-01-01T00:05:00.000Z" },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const output = vi.fn();
        const binding = chatStoreCreate("chat-1", output);
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        binding.getState().portShareDisable("share-1");
        expect(binding.getState().portShareDisablingIds).toEqual(["share-1"]);
        const submitted = output.mock.calls
            .map(([event]) => event)
            .find(({ type }) => type === "portShareDisableSubmitted");
        expect(submitted).toMatchObject({ chatId: "chat-1", portShareId: "share-1" });
        await chatPortShareDisable(context, "chat-1", "share-1");
        expect(binding.getState().portShares).toMatchObject({ type: "ready", value: [] });
        expect(binding.getState().portShareDisablingIds).toEqual([]);
        runtime.stop();
    });

    it("keeps the busy marker and surfaces the error when a disable fails", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/portShares/share-1/disablePortShare",
            jsonResponse(409, { error: "conflict", message: "The share is already disabled." }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        binding.getState().portShareDisable("share-1");
        await chatPortShareDisable(context, "chat-1", "share-1");
        expect(binding.getState().portShareDisablingIds).toEqual([]);
        expect(binding.getState().portShareActionError?.message).toBe(
            "The share is already disabled.",
        );
        // The share remains on both surfaces because the disable never confirmed.
        expect(binding.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1" }],
        });
        runtime.stop();
    });

    it("preserves share references across an unchanged reconcile read and prunes stale busy markers", () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({ type: "portSharesLoading" });
        binding.getState().chatInput({ type: "portSharesLoaded", portShares: [sampleShare] });
        const before = binding.getState().portShares;
        binding
            .getState()
            .chatInput({ type: "portSharesLoaded", portShares: [{ ...sampleShare }] });
        // An equivalent reload keeps the whole snapshot and per-share references stable.
        expect(binding.getState().portShares).toBe(before);

        binding.getState().portShareDisable("share-1");
        expect(binding.getState().portShareDisablingIds).toEqual(["share-1"]);
        // Once the share leaves the durable active list, its busy marker is pruned.
        binding.getState().chatInput({ type: "portSharesLoaded", portShares: [] });
        expect(binding.getState().portShareDisablingIds).toEqual([]);
        expect(binding.getState().portShares).toMatchObject({ type: "ready", value: [] });
    });

    it("keeps a ready share list on screen when a reconcile read fails", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
            jsonResponse(500, { error: "internal", message: "boom" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        binding.getState().portSharesRetain();
        await chatPortSharesLoad(context, "chat-1");
        expect(binding.getState().portShares.type).toBe("ready");
        await chatPortSharesLoad(context, "chat-1");
        expect(binding.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1" }],
        });
        runtime.stop();
    });

    it("clears the disabling marker on the disable success even when the follow-up reconcile read fails", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
            jsonResponse(500, { error: "internal", message: "boom" }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/portShares/share-1/disablePortShare",
            jsonResponse(200, {
                portShare: { ...sampleShare, disabledAt: "2026-01-01T00:05:00.000Z" },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        binding.getState().portShareDisable("share-1");
        expect(binding.getState().portShareDisablingIds).toEqual(["share-1"]);
        await chatPortShareDisable(context, "chat-1", "share-1");
        // The busy marker cleared on the POST success and did not get stranded by
        // the failing reconcile GET; the ready list stays coherent (SSE reconciles
        // the removal later) and no spurious error is surfaced.
        expect(binding.getState().portShareDisablingIds).toEqual([]);
        expect(binding.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1" }],
        });
        expect(binding.getState().portShareActionError).toBeUndefined();
        runtime.stop();
    });

    it("settles a disable requested while disconnected with a displayable error and no transport work", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [sampleShare] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const context = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortSharesLoad(context, "chat-1");
        binding.getState().portShareDisable("share-1");
        expect(binding.getState().portShareDisablingIds).toEqual(["share-1"]);
        // Disconnect before the action runs.
        runtime.stop();
        const offline = { runtime, identities: new IdentityCatalog(), chatGet: () => binding };
        await chatPortShareDisable(offline, "chat-1", "share-1");
        expect(binding.getState().portShareDisablingIds).toEqual([]);
        expect(binding.getState().portShareActionError?.message).toContain("not connected");
        // No disable POST was issued while offline.
        expect(server.requests.some((request) => request.path.includes("disablePortShare"))).toBe(
            false,
        );
    });

    it("clears a stale action error when the active share identity changes and keeps it on an equivalent reconcile", () => {
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({ type: "portSharesLoaded", portShares: [sampleShare] });
        binding.getState().chatInput({
            type: "portShareOpenFailed",
            portShareId: "share-1",
            error: new UserError("Allow pop-ups for this app to open the shared preview."),
        });
        expect(binding.getState().portShareActionError).toBeDefined();

        // An equivalent reconcile of the same active share keeps the error.
        binding
            .getState()
            .chatInput({ type: "portSharesLoaded", portShares: [{ ...sampleShare }] });
        expect(binding.getState().portShareActionError).toBeDefined();

        // A durable read that replaces share A with share B drops the stale error.
        binding.getState().chatInput({
            type: "portSharesLoaded",
            portShares: [{ ...sampleShare, id: "share-2", subdomain: "replacement-xyz789" }],
        });
        expect(binding.getState().portShareActionError).toBeUndefined();
    });
});
