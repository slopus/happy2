import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    documentFlush,
    documentLoad,
    documentPresenceSend,
    documentReconcile,
    documentRemoteOrigin,
    documentSessionStop,
    documentStoreCreate,
    documentSynchronize,
    type DocumentActionContext,
    type DocumentStore,
} from "./documentState.js";

const summary = (latestSequence: string) => ({
    id: "doc-1",
    chatId: "chat-1",
    title: "Shared page",
    format: "blocknote" as const,
    latestSequence,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
});

function encode(update: Uint8Array): string {
    return Buffer.from(update).toString("base64");
}

function context(runtime: StateRuntime, store: DocumentStore): DocumentActionContext {
    return { runtime, documentGet: (id) => (id === "doc-1" ? store : undefined) };
}

describe("document session store", () => {
    it("captures local Yjs edits, flushes one idempotent batch, and applies the acknowledgement", async () => {
        const output = vi.fn();
        const store = documentStoreCreate("doc-1", output, { clientId: "client-a" });
        const text = store.getState().ydoc.getText("content");
        text.insert(0, "Hello");
        text.insert(5, " world");
        expect(output).toHaveBeenCalledWith({ type: "documentUpdatesQueued", documentId: "doc-1" });
        expect(store.getState().pendingUpdates).toHaveLength(2);
        expect(store.getState().saveState).toBe("dirty");

        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/documents/doc-1/applyUpdates",
            jsonResponse(201, {
                document: summary("1"),
                acceptedSequence: "1",
                replayed: false,
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        await documentFlush(context(runtime, store), "doc-1");
        const request = server.requests.at(-1)!;
        expect(request.path).toBe("/v0/documents/doc-1/applyUpdates");
        const body = request.body as { clientUpdateId: string; updates: string[] };
        expect(body.updates).toHaveLength(2);
        expect(body.clientUpdateId.length).toBeGreaterThan(0);
        expect(store.getState().pendingUpdates).toEqual([]);
        expect(store.getState().saveState).toBe("idle");
        expect(store.getState().latestSequence).toBe(1);
        documentSessionStop(store);
        runtime.stop();
    });

    it("returns a failed batch to the pending queue with a surfaced save error", async () => {
        const store = documentStoreCreate("doc-1", undefined, { clientId: "client-a" });
        store.getState().ydoc.getText("content").insert(0, "Unsaved");
        const captured = store.getState().pendingUpdates;
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/documents/doc-1/applyUpdates",
            jsonResponse(400, { error: "invalid_request", message: "Rejected" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, sleep: async () => {} });
        await documentFlush(context(runtime, store), "doc-1");
        expect(store.getState().saveState).toBe("error");
        expect(store.getState().saveError).toBeDefined();
        expect(store.getState().pendingUpdates).toEqual(captured);
        documentSessionStop(store);
        runtime.stop();
    });

    it("hydrates the snapshot and applies remote differences without re-queueing them as edits", async () => {
        const remote = new Y.Doc();
        remote.getText("content").insert(0, "From the server");
        const snapshotUpdate = encode(Y.encodeStateAsUpdate(remote));
        const before = Y.encodeStateVector(remote);
        remote.getText("content").insert(15, " and a difference");
        const differenceUpdate = encode(Y.encodeStateAsUpdate(remote, before));

        const store = documentStoreCreate("doc-1", undefined, { clientId: "client-a" });
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/documents/doc-1",
            jsonResponse(200, {
                document: summary("1"),
                snapshot: { update: snapshotUpdate, sequence: "1" },
            }),
        );
        server.respond(
            "POST",
            "/v0/documents/doc-1/getDifference",
            jsonResponse(200, {
                document: summary("2"),
                updates: [{ sequence: "2", update: differenceUpdate }],
                latestSequence: "2",
                hasMore: false,
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const actions = context(runtime, store);
        await documentLoad(actions, "doc-1");
        expect(store.getState().document).toMatchObject({ type: "ready" });
        expect(store.getState().ydoc.getText("content").toString()).toBe("From the server");
        expect(store.getState().latestSequence).toBe(1);
        await documentSynchronize(actions, "doc-1");
        expect(store.getState().ydoc.getText("content").toString()).toBe(
            "From the server and a difference",
        );
        expect(store.getState().latestSequence).toBe(2);
        const differenceRequest = server.requests.at(-1)!;
        expect(differenceRequest.body).toMatchObject({ afterSequence: "1" });
        // Server-applied updates are remote-origin and must never enter the outbox.
        expect(store.getState().pendingUpdates).toEqual([]);
        expect(store.getState().saveState).toBe("idle");
        documentSessionStop(store);
        runtime.stop();
    });

    it("skips delivery hints whose sequence the session has already applied", async () => {
        const store = documentStoreCreate("doc-1", undefined, { clientId: "client-a" });
        Y.applyUpdate(
            store.getState().ydoc,
            Y.encodeStateAsUpdate(new Y.Doc()),
            documentRemoteOrigin,
        );
        store.getState().documentInput({
            type: "documentLoaded",
            document: summary("3"),
            snapshotUpdate: Y.encodeStateAsUpdate(new Y.Doc()),
            sequence: 3,
        });
        const server = createFakeServer();
        const runtime = new StateRuntime({ transport: server.transport });
        documentReconcile(context(runtime, store), "doc-1", 3);
        await runtime.whenIdle();
        expect(server.requests).toHaveLength(0);
        documentSessionStop(store);
        runtime.stop();
    });

    it("gates remote presence by revision, drops the local client, and expires leavers", async () => {
        const output = vi.fn();
        const store = documentStoreCreate("doc-1", output, { clientId: "client-a" });
        const entry = (revision: number, active: boolean, anchor: number) => ({
            documentId: "doc-1",
            userId: "user-b",
            clientId: "client-b",
            revision,
            active,
            state: { anchor },
            ...(active ? { expiresAt: Date.now() + 15_000 } : {}),
        });
        store.getState().documentInput({
            type: "documentPresenceReconciled",
            presence: entry(2, true, 1),
        });
        expect(store.getState().presence).toHaveLength(1);
        store.getState().documentInput({
            type: "documentPresenceReconciled",
            presence: entry(1, true, 9),
        });
        expect(store.getState().presence[0]).toMatchObject({ state: { anchor: 1 } });
        store.getState().documentInput({
            type: "documentPresenceReconciled",
            presence: {
                documentId: "doc-1",
                userId: "user-a",
                clientId: "client-a",
                revision: 9,
                active: true,
                expiresAt: Date.now() + 15_000,
            },
        });
        expect(store.getState().presence).toHaveLength(1);
        store.getState().documentInput({
            type: "documentPresenceReconciled",
            presence: entry(3, false, 1),
        });
        expect(store.getState().presence).toEqual([]);

        store.getState().documentPresenceUpdate({ anchor: 4 }, true);
        expect(output).toHaveBeenCalledWith({
            type: "documentPresenceQueued",
            documentId: "doc-1",
        });
        expect(store.getState().localPresence).toMatchObject({ revision: 1, active: true });

        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/documents/doc-1/updatePresence",
            jsonResponse(200, {
                accepted: true,
                presence: [
                    {
                        documentId: "doc-1",
                        userId: "user-a",
                        clientId: "client-a",
                        revision: 1,
                        active: true,
                        expiresAt: Date.now() + 15_000,
                    },
                    entry(4, true, 7),
                ],
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        await documentPresenceSend(context(runtime, store), "doc-1");
        expect(server.requests.at(-1)!.body).toMatchObject({
            clientId: "client-a",
            revision: 1,
            active: true,
            state: { anchor: 4 },
        });
        expect(store.getState().presence).toEqual([entry(4, true, 7)]);
        documentSessionStop(store);
        runtime.stop();
    });
});
