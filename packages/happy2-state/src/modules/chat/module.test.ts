import { describe, expect, it, vi } from "vitest";
import type { PluginManagementRequestSummary } from "../../resources.js";
import { UserError } from "../../types.js";
import { chat, message } from "../../../tests/fixtures.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { composerStoreCreate } from "../composer/composerState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { chatMembersLoad } from "./chatState.js";
import { chatPluginRequestDecide, chatPluginRequestsLoad } from "./chatState.js";
import { chatStoreCreate } from "./chatState.js";
import { messageItemProject } from "./chatState.js";

describe("chat module", () => {
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
