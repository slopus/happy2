import { describe, expect, it } from "vitest";
import { createClientState, happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";

describe("incremental state migration boundary", () => {
    it("keeps legacy and micro stores independently usable without mirroring", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "legacy", sequence: "0" },
                serverTime: "2026-07-17T00:00:00.000Z",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));

        await using legacy = createClientState(server.transport);
        using current = happyStateCreate();
        const composer = current.composer("chat-1");
        await legacy.start();

        const legacyBefore = legacy.get();
        composer.textUpdate("new-store-only draft");

        expect(legacy.get()).toBe(legacyBefore);
        expect(composer.get().text).toBe("new-store-only draft");

        const composerBefore = composer.get();
        server.events.presence({
            change: "connected",
            occurredAt: 1,
            snapshot: { userId: "user-1", status: "online", connectionCount: 1 },
        });

        expect(legacy.get().presence).toEqual([
            { userId: "user-1", status: "online", connectionCount: 1 },
        ]);
        expect(composer.get()).toBe(composerBefore);
    });
});
