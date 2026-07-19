import { describe, expect, it, vi } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";
import { agentTraceDetails, agentTraceSummary, chat, message } from "./fixtures.js";

const syncStateResponse = jsonResponse(200, {
    state: { protocolVersion: 1, generation: "g", sequence: "0" },
    serverTime: "now",
});

function syncDifference(sequence: string, chatPts: string) {
    return jsonResponse(200, {
        kind: "empty",
        changedChats: [chat({ pts: chatPts })],
        removedChatIds: [],
        areas: [],
        state: { protocolVersion: 1, generation: "g", sequence },
        targetState: { protocolVersion: 1, generation: "g", sequence },
    });
}

function chatDifference(pts: string, messages: readonly unknown[]) {
    return jsonResponse(200, {
        kind: "difference",
        updates: [],
        messages,
        chat: chat({ pts }),
        state: { membershipEpoch: "1", pts },
        targetState: { membershipEpoch: "1", pts },
    });
}

function assistantMessage(changePts: string, overrides: Parameters<typeof message>[0] = {}) {
    return message({
        id: "message-2",
        sequence: "2",
        changePts,
        kind: "automated",
        generationStatus: "streaming",
        text: "",
        ...overrides,
    });
}

describe("Agent turn trace surface stays live without refetch storms", () => {
    it("refetches an open trace only when the message summary changes", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/sync/state", syncStateResponse);
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "GET",
            "/v0/messages/message-2/agentTrace",
            jsonResponse(200, { trace: agentTraceDetails() }),
            jsonResponse(200, {
                trace: agentTraceDetails({
                    entryCount: 2,
                    latest: { kind: "reasoning", title: "Reasoning", occurredAt: 2 },
                }),
            }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            syncDifference("1", "2"),
            syncDifference("2", "3"),
            syncDifference("3", "4"),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/getDifference",
            chatDifference("2", [
                assistantMessage("2", { agentTrace: agentTraceSummary({ entryCount: 2 }) }),
            ]),
            chatDifference("3", [
                assistantMessage("3", {
                    text: "Stream",
                    agentTrace: agentTraceSummary({
                        entryCount: 2,
                        latest: { kind: "reasoning", title: "Reasoning", occurredAt: 2 },
                    }),
                }),
            ]),
            chatDifference("4", [message({ changePts: "4", text: "edited user text" })]),
        );
        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        using chatHandle = state.chatOpen("chat-1");
        await state.whenIdle();
        expect(chatHandle.getState().status.type).toBe("ready");
        using trace = state.agentTraceOpen("message-2");
        await state.whenIdle();
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { entryCount: 1 },
        });
        const traceRequests = () =>
            server.requests.filter(({ path }) => path === "/v0/messages/message-2/agentTrace")
                .length;
        expect(traceRequests()).toBe(1);

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { entryCount: 2, latest: { kind: "reasoning" } },
        });
        expect(traceRequests()).toBe(2);

        server.events.sync({ sequence: "2" });
        await state.whenIdle();
        expect(traceRequests()).toBe(2);

        server.events.sync({ sequence: "3" });
        await state.whenIdle();
        expect(traceRequests()).toBe(2);
    });

    it("recovers an early-opened trace once the turn appears in a difference", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/sync/state", syncStateResponse);
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "GET",
            "/v0/messages/message-2/agentTrace",
            jsonResponse(404, { error: "not_found", message: "Agent turn trace was not found" }),
            jsonResponse(200, { trace: agentTraceDetails() }),
        );
        server.respond("POST", "/v0/sync/getDifference", syncDifference("1", "2"));
        server.respond(
            "POST",
            "/v0/chats/chat-1/getDifference",
            chatDifference("2", [assistantMessage("2", { agentTrace: agentTraceSummary() })]),
        );
        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        using chatHandle = state.chatOpen("chat-1");
        await state.whenIdle();
        expect(chatHandle.getState().status.type).toBe("ready");
        using trace = state.agentTraceOpen("message-2");
        await state.whenIdle();
        expect(trace.getState().trace.type).toBe("error");

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { turnId: "turn-1", entryCount: 1 },
        });
    });

    it("revalidates an open trace when its message is deleted instead of serving cache", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/sync/state", syncStateResponse);
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "GET",
            "/v0/messages/message-2/agentTrace",
            jsonResponse(200, { trace: agentTraceDetails({ status: "complete" }) }),
            jsonResponse(404, { error: "not_found", message: "Agent turn trace was not found" }),
        );
        server.respond("POST", "/v0/sync/getDifference", syncDifference("1", "2"));
        server.respond(
            "POST",
            "/v0/chats/chat-1/getDifference",
            chatDifference("2", [
                message({
                    id: "message-2",
                    sequence: "2",
                    changePts: "2",
                    kind: "automated",
                    text: "",
                    deletedAt: "2026-01-01T00:00:05.000Z",
                }),
            ]),
        );
        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        using chatHandle = state.chatOpen("chat-1");
        await state.whenIdle();
        expect(chatHandle.getState().status.type).toBe("ready");
        using trace = state.agentTraceOpen("message-2");
        await state.whenIdle();
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { status: "complete" },
        });

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(trace.getState().trace.type).toBe("error");
    });

    it("revalidates an open trace when its chat is removed from the account", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/sync/state", syncStateResponse);
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "GET",
            "/v0/messages/message-2/agentTrace",
            jsonResponse(200, { trace: agentTraceDetails({ status: "complete" }) }),
            jsonResponse(404, { error: "not_found", message: "Agent turn trace was not found" }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [],
                removedChatIds: ["chat-1"],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        using chatHandle = state.chatOpen("chat-1");
        await state.whenIdle();
        expect(chatHandle.getState().status.type).toBe("ready");
        using trace = state.agentTraceOpen("message-2");
        await state.whenIdle();
        expect(trace.getState().trace.type).toBe("ready");

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(trace.getState().trace.type).toBe("error");
    });

    it("keeps live subagents and background terminals on chat agent activity and expires them", async () => {
        vi.useFakeTimers();
        try {
            const server = createFakeServer();
            server.respond("GET", "/v0/sync/state", syncStateResponse);
            server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
            server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
            server.respond(
                "GET",
                "/v0/chats/chat-1/messages?limit=100",
                jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "1" }),
            );
            using state = happyStateCreate({ transport: server.transport });
            await state.syncStart();
            using chatHandle = state.chatOpen("chat-1");
            await state.whenIdle();
            server.events.agentActivity({
                chatId: "chat-1",
                agentUserId: "agent-1",
                turnId: "turn-1",
                active: true,
                phase: "thinking",
                tokenCount: 42,
                startedAt: Date.now(),
                expiresAt: Date.now() + 15_000,
                subagents: [
                    {
                        id: "subagent-1",
                        depth: 1,
                        description: "Review server tests",
                        status: "running",
                        latestText: "Reading the gym harness",
                        startedAt: Date.now(),
                        totalTokens: 64,
                    },
                ],
                backgroundTerminals: [
                    { id: "7", command: "pnpm test --watch", cwd: "/workspace", startedAt: 1 },
                ],
            });
            expect(chatHandle.getState().agentActivity).toMatchObject([
                {
                    turnId: "turn-1",
                    subagents: [{ id: "subagent-1", latestText: "Reading the gym harness" }],
                    backgroundTerminals: [{ id: "7", command: "pnpm test --watch" }],
                },
            ]);
            vi.advanceTimersByTime(16_000);
            expect(chatHandle.getState().agentActivity).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });
});
