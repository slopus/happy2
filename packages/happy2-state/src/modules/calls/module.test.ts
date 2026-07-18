import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { callsLoad, callsOutputRoute } from "./callsState.js";
import { callsStoreCreate } from "./callsState.js";

describe("calls module", () => {
    it("routes lifecycle output, bounds signals, and surfaces action failure locally", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/chats/chat-1/createCall",
            jsonResponse(200, { call: call("call-1") }),
        );
        server.respond(
            "GET",
            "/v0/calls?limit=100",
            jsonResponse(200, { calls: [call("call-1")] }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const identities = new IdentityCatalog();
        let binding: ReturnType<typeof callsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = callsStoreCreate((event) =>
            routed.push(callsOutputRoute({ runtime, identities, calls: binding }, event)),
        );
        binding.getState().callCreate("chat-1", "audio", ["user-2"]);
        await Promise.all(routed);
        expect(binding.getState().calls).toMatchObject({
            type: "ready",
            value: [{ id: "call-1" }],
        });
        for (let index = 0; index < 70; index += 1)
            binding.getState().callsInput({
                type: "callSignalReceived",
                signal: {
                    callId: "call-1",
                    senderUserId: "user-2",
                    signal: { kind: "hangup", reason: index % 2 === 0 ? "ended" : "busy" },
                    occurredAt: index,
                },
            });
        expect(binding.getState().signalsByCall["call-1"]).toHaveLength(64);
        await callsOutputRoute(
            { runtime, identities, calls: binding },
            { type: "callJoinSubmitted", callId: "missing" },
        );
        expect(binding.getState().actionError).toBeTruthy();
        runtime.stop();
    });

    it("emits every call command without returning transport work", () => {
        const output = vi.fn();
        const binding = callsStoreCreate(output);
        binding.getState().callJoin("call-1");
        binding.getState().callDecline("call-1");
        binding.getState().callLeave("call-1");
        binding.getState().callEnd("call-1");
        binding.getState().callSignalSend("call-1", "chat-1", "user-2", {
            kind: "offer",
            sdp: "session",
        });
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "callJoinSubmitted",
            "callDeclineSubmitted",
            "callLeaveSubmitted",
            "callEndSubmitted",
            "callSignalSubmitted",
        ]);
    });

    it("does not invalidate an active catalog load when sending an ephemeral signal", async () => {
        const server = createFakeServer();
        let releaseLoad!: () => void;
        server.route(
            "GET",
            (path) => path.startsWith("/v0/calls?"),
            async () => {
                await new Promise<void>((resolve) => (releaseLoad = resolve));
                return jsonResponse(200, { calls: [call("call-1")] });
            },
        );
        server.respond("POST", "/v0/calls/call-1/sendSignal", jsonResponse(200, {}));
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const binding = callsStoreCreate();
        const loading = callsLoad({ runtime, identities, calls: binding });
        await vi.waitFor(() => expect(releaseLoad).toBeTypeOf("function"));
        await callsOutputRoute(
            { runtime, identities, calls: binding },
            {
                type: "callSignalSubmitted",
                callId: "call-1",
                chatId: "chat-1",
                recipientUserId: "user-2",
                signal: { kind: "offer", sdp: "session" },
            },
        );
        releaseLoad();
        await loading;
        expect(binding.getState().calls).toMatchObject({
            type: "ready",
            value: [{ id: "call-1" }],
        });
        runtime.stop();
    });

    it("reconciles a lifecycle mutation that completes during an active catalog load", async () => {
        const server = createFakeServer();
        let releaseLoad!: () => void;
        let catalogRequests = 0;
        server.route(
            "GET",
            (path) => path.startsWith("/v0/calls?"),
            async () => {
                const requestNumber = ++catalogRequests;
                if (requestNumber === 1)
                    await new Promise<void>((resolve) => (releaseLoad = resolve));
                return jsonResponse(200, {
                    calls:
                        requestNumber === 1
                            ? [call("existing-call")]
                            : [call("existing-call"), call("created-call")],
                });
            },
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/createCall",
            jsonResponse(200, { call: call("created-call") }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const binding = callsStoreCreate();
        const loading = callsLoad({ runtime, identities, calls: binding });
        await vi.waitFor(() => expect(releaseLoad).toBeTypeOf("function"));
        await callsOutputRoute(
            { runtime, identities, calls: binding },
            { type: "callCreateSubmitted", chatId: "chat-1", kind: "audio" },
        );
        releaseLoad();
        await loading;
        expect(binding.getState().calls).toMatchObject({
            type: "ready",
            value: [{ id: "existing-call" }, { id: "created-call" }],
        });
        runtime.stop();
    });

    it("reconciles durable state after lifecycle responses resolve out of order", async () => {
        const server = createFakeServer();
        let releaseJoin!: () => void;
        let status: "ringing" | "active" | "ended" = "ringing";
        server.route("POST", "/v0/calls/call-1/joinCall", async () => {
            status = "active";
            await new Promise<void>((resolve) => (releaseJoin = resolve));
            return jsonResponse(200, { call: { ...call("call-1"), status: "active" } });
        });
        server.route("POST", "/v0/calls/call-1/leaveCall", () => {
            status = "ended";
            return jsonResponse(200, { call: { ...call("call-1"), status } });
        });
        server.route(
            "GET",
            (path) => path.startsWith("/v0/calls?"),
            () => jsonResponse(200, { calls: [{ ...call("call-1"), status }] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const binding = callsStoreCreate();
        const delayedJoin = callsOutputRoute(
            { runtime, identities, calls: binding },
            { type: "callJoinSubmitted", callId: "call-1" },
        );
        await vi.waitFor(() => expect(releaseJoin).toBeTypeOf("function"));
        await callsOutputRoute(
            { runtime, identities, calls: binding },
            { type: "callLeaveSubmitted", callId: "call-1" },
        );
        releaseJoin();
        await delayedJoin;
        expect(binding.getState().calls).toMatchObject({
            type: "ready",
            value: [{ id: "call-1", status: "ended" }],
        });
        runtime.stop();
    });
});

function call(id: string) {
    return {
        id,
        chatId: "chat-1",
        kind: "audio" as const,
        status: "ringing" as const,
        participants: [],
        createdAt: "now",
        updatedAt: "now",
    };
}
