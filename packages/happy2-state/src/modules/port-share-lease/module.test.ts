import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { IdentityCatalog } from "../identity/identityState.js";
import {
    chatPortShareDisable,
    chatStoreCreate,
    type PortShareAccessTarget,
} from "../chat/chatState.js";
import { PortShareLeaseCoordinator } from "./portShareLeaseState.js";

const BASE = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const sampleShare = {
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

function fakeTarget() {
    let closed = false;
    const exchange = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => undefined);
    const release = vi.fn();
    const target: PortShareAccessTarget = {
        navigate,
        exchange,
        release,
        get closed() {
            return closed;
        },
    };
    return { target, exchange, navigate, release, close: () => (closed = true) };
}

describe("port share refresh lease", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(BASE);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("re-issues and re-exchanges at each server refreshAfter without exposing tokens", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/portShares/share-1/createAccessToken",
            jsonResponse(200, {
                token: "token-1",
                expiresAt: iso(BASE + 60 * 60_000),
                refreshAfter: iso(BASE + 30 * 60_000),
                portShare: { ...sampleShare, url: `${sampleShare.url}?r=1` },
            }),
            jsonResponse(200, {
                token: "token-2",
                expiresAt: iso(BASE + 90 * 60_000),
                refreshAfter: iso(BASE + 45 * 60_000),
                portShare: { ...sampleShare, url: `${sampleShare.url}?r=2` },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const lease = new PortShareLeaseCoordinator({ runtime, chatGet: () => binding });
        const t = fakeTarget();
        lease.start({
            chatId: "chat-1",
            portShareId: "share-1",
            url: sampleShare.url,
            refreshAfter: iso(BASE + 15 * 60_000),
            target: t.target,
        });

        // Nothing fires before refreshAfter.
        await vi.advanceTimersByTimeAsync(15 * 60_000 - 1);
        expect(t.exchange).not.toHaveBeenCalled();

        // First refresh fires exactly at refreshAfter with a freshly issued token.
        await vi.advanceTimersByTimeAsync(1);
        expect(t.exchange).toHaveBeenCalledTimes(1);
        expect(t.exchange).toHaveBeenLastCalledWith(`${sampleShare.url}?r=1`, "token-1");

        // The next refresh is scheduled from the new server refreshAfter (+30m).
        await vi.advanceTimersByTimeAsync(15 * 60_000);
        expect(t.exchange).toHaveBeenCalledTimes(2);
        expect(t.exchange).toHaveBeenLastCalledWith(`${sampleShare.url}?r=2`, "token-2");

        // The window was never re-navigated, and no token entered the snapshot.
        expect(t.navigate).not.toHaveBeenCalled();
        const snapshot = JSON.stringify(binding.getState());
        expect(snapshot).not.toContain("token-1");
        expect(snapshot).not.toContain("token-2");

        lease.dispose();
        runtime.stop();
    });

    it("stops the lease when the external tab is closed, issuing no further token", async () => {
        const server = createFakeServer();
        const token = vi.fn(() =>
            jsonResponse(200, {
                token: "token",
                expiresAt: iso(BASE + 60 * 60_000),
                refreshAfter: iso(BASE + 30 * 60_000),
                portShare: sampleShare,
            }),
        );
        server.route("POST", "/v0/portShares/share-1/createAccessToken", token);
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const lease = new PortShareLeaseCoordinator({ runtime, chatGet: () => binding });
        const t = fakeTarget();
        lease.start({
            chatId: "chat-1",
            portShareId: "share-1",
            url: sampleShare.url,
            refreshAfter: iso(BASE + 15 * 60_000),
            target: t.target,
        });
        t.close();
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        expect(token).not.toHaveBeenCalled();
        expect(t.exchange).not.toHaveBeenCalled();
        runtime.stop();
    });

    it("stops leases on reconcile removal, chat stop, and dispose with no later work", async () => {
        for (const stop of ["reconcile", "chat", "dispose"] as const) {
            const server = createFakeServer();
            const token = vi.fn(() =>
                jsonResponse(200, {
                    token: "token",
                    expiresAt: iso(BASE + 60 * 60_000),
                    refreshAfter: iso(BASE + 30 * 60_000),
                    portShare: sampleShare,
                }),
            );
            server.route("POST", "/v0/portShares/share-1/createAccessToken", token);
            const runtime = new StateRuntime({ transport: server.transport });
            const binding = chatStoreCreate("chat-1");
            const lease = new PortShareLeaseCoordinator({ runtime, chatGet: () => binding });
            const t = fakeTarget();
            lease.start({
                chatId: "chat-1",
                portShareId: "share-1",
                url: sampleShare.url,
                refreshAfter: iso(BASE + 15 * 60_000),
                target: t.target,
            });
            if (stop === "reconcile") lease.reconcile("chat-1", new Set());
            else if (stop === "chat") lease.stopForChat("chat-1");
            else lease.dispose();
            await vi.advanceTimersByTimeAsync(60 * 60_000);
            expect(token, stop).not.toHaveBeenCalled();
            expect(t.exchange, stop).not.toHaveBeenCalled();
            runtime.stop();
        }
    });

    it("stops the lease and surfaces a displayable error when a refresh issuance fails", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/portShares/share-1/createAccessToken",
            jsonResponse(404, { error: "not_found", message: "Active port share was not found" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const binding = chatStoreCreate("chat-1");
        const lease = new PortShareLeaseCoordinator({ runtime, chatGet: () => binding });
        const t = fakeTarget();
        lease.start({
            chatId: "chat-1",
            portShareId: "share-1",
            url: sampleShare.url,
            refreshAfter: iso(BASE + 15 * 60_000),
            target: t.target,
        });
        await vi.advanceTimersByTimeAsync(15 * 60_000);
        expect(t.exchange).not.toHaveBeenCalled();
        expect(binding.getState().portShareActionError?.message).toContain("not");
        // The lease stopped: no further token issuance after the failure.
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        expect(server.requests.filter((request) => request.method === "POST")).toHaveLength(1);
        runtime.stop();
    });

    it("clamps a malformed refreshAfter to the 15-minute fallback cadence", async () => {
        const server = createFakeServer();
        const token = vi.fn(() =>
            jsonResponse(200, {
                token: "token",
                expiresAt: iso(BASE + 60 * 60_000),
                refreshAfter: iso(BASE + 90 * 60_000),
                portShare: sampleShare,
            }),
        );
        server.route("POST", "/v0/portShares/share-1/createAccessToken", token);
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = chatStoreCreate("chat-1");
        const lease = new PortShareLeaseCoordinator({ runtime, chatGet: () => binding });
        const t = fakeTarget();
        lease.start({
            chatId: "chat-1",
            portShareId: "share-1",
            url: sampleShare.url,
            refreshAfter: "not-a-date",
            target: t.target,
        });
        await vi.advanceTimersByTimeAsync(15 * 60_000 - 1);
        expect(token).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(token).toHaveBeenCalledTimes(1);
        lease.dispose();
        runtime.stop();
    });

    it("stops a confirmed-disabled share's lease immediately even when the follow-up list read fails", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/chats/chat-1/portShares/share-1/disablePortShare",
            jsonResponse(200, {
                portShare: { ...sampleShare, disabledAt: iso(BASE + 5 * 60_000) },
            }),
        );
        // The follow-up durable read fails, so the local ready list keeps the share
        // (removal is never fabricated); the lease must still stop at once.
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(500, { error: "internal", message: "boom" }),
        );
        const token = vi.fn(() =>
            jsonResponse(200, {
                token: "token",
                expiresAt: iso(BASE + 60 * 60_000),
                refreshAfter: iso(BASE + 30 * 60_000),
                portShare: sampleShare,
            }),
        );
        server.route("POST", "/v0/portShares/share-1/createAccessToken", token);
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const binding = chatStoreCreate("chat-1");
        binding.getState().chatInput({ type: "portSharesLoaded", portShares: [sampleShare] });
        const lease = new PortShareLeaseCoordinator({ runtime, chatGet: () => binding });
        const t = fakeTarget();
        lease.start({
            chatId: "chat-1",
            portShareId: "share-1",
            url: sampleShare.url,
            refreshAfter: iso(BASE + 15 * 60_000),
            target: t.target,
        });

        binding.getState().portShareDisable("share-1");
        expect(binding.getState().portShareDisablingIds).toEqual(["share-1"]);
        await chatPortShareDisable(
            {
                runtime,
                identities: new IdentityCatalog(),
                chatGet: () => binding,
                portShareDisabled: (chatId, portShareId) => lease.stopForShare(chatId, portShareId),
            },
            "chat-1",
            "share-1",
        );

        // Busy settled on the POST success; the failed GET fabricated no removal.
        expect(binding.getState().portShareDisablingIds).toEqual([]);
        expect(binding.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1" }],
        });
        expect(binding.getState().portShareActionError).toBeUndefined();

        // The lease stopped immediately: no reissue happens past refreshAfter.
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        expect(token).not.toHaveBeenCalled();
        expect(t.exchange).not.toHaveBeenCalled();
        lease.dispose();
        runtime.stop();
    });
});
