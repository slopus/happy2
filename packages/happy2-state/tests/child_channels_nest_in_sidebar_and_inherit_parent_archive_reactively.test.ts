import { describe, expect, it } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse, type FakeServer } from "../src/testing/index.js";
import { chat } from "./fixtures.js";

function syncState(sequence: string) {
    return { protocolVersion: 1 as const, generation: "g", sequence };
}

function serverCreate(): FakeServer {
    const server = createFakeServer();
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, { state: syncState("0"), serverTime: "now" }),
    );
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: "2026-01-01T00:00:00.000Z" }),
    );
    return server;
}

const parent = chat({ id: "parent-1", kind: "private_channel", name: "Parent", slug: "parent" });
const child = chat({
    id: "child-1",
    kind: "private_channel",
    name: "Investigation",
    slug: "investigation",
    parentChatId: parent.id,
    agentModelId: "gym/alternate-agent",
});

function difference(changedChats: readonly unknown[], sequence: string) {
    return jsonResponse(200, {
        kind: "difference",
        changedChats,
        removedChatIds: [],
        areas: [],
        state: syncState(sequence),
        targetState: syncState(sequence),
    });
}

describe("child channels nest in the sidebar and inherit a parent archive reactively", () => {
    it("creates a child under its parent with an independent model and one idempotency key", async () => {
        const server = serverCreate();
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [parent] }));
        server.respond("GET", "/v0/projects", jsonResponse(200, { projects: [] }));
        server.failNext("POST", `/v0/chats/${parent.id}/createChildChannel`);
        server.respond(
            "POST",
            `/v0/chats/${parent.id}/createChildChannel`,
            jsonResponse(201, { chat: child, sync: {} }),
        );
        using state = happyStateCreate({
            transport: server.transport,
            retry: { attempts: 2 },
            createId: () => "mutation-1",
        });
        await state.syncStart();
        await state.whenIdle();
        expect(
            state
                .sidebar()
                .getState()
                .chats.map((item) => item.id),
        ).toEqual([parent.id]);

        await state.channelCreateChild({
            parentChatId: parent.id,
            name: "Investigation",
            slug: "investigation",
            agentModelId: "gym/alternate-agent",
        });
        await state.whenIdle();

        const nested = state
            .sidebar()
            .getState()
            .chats.find((item) => item.id === child.id);
        expect(nested?.chat.parentChatId).toBe(parent.id);
        expect(nested?.chat.agentModelId).toBe("gym/alternate-agent");

        const creates = server.requests.filter(({ path }) => path.endsWith("/createChildChannel"));
        expect(creates).toHaveLength(2);
        expect(creates.map(({ headers }) => headers?.["idempotency-key"])).toEqual([
            "mutation-1",
            "mutation-1",
        ]);
    });

    it("reconciles independent child archive and parent cascade through the difference stream", async () => {
        const server = serverCreate();
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [parent, child] }));
        server.respond("GET", "/v0/projects", jsonResponse(200, { projects: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            // 1) The child is archived on its own; the parent stays active.
            difference([{ ...child, archivedAt: "2026-07-01T00:00:00.000Z" }], "1"),
            // 2) The child is restored on its own.
            difference([{ ...child, archivedAt: undefined }], "2"),
            // 3) The parent is archived: the server advances the child with an inherited archive.
            difference(
                [
                    { ...parent, archivedAt: "2026-07-02T00:00:00.000Z" },
                    { ...child, archivedAt: "2026-07-02T00:00:00.000Z" },
                ],
                "3",
            ),
            // 4) The parent is restored: the child's inherited archive clears with it.
            difference(
                [
                    { ...parent, archivedAt: undefined },
                    { ...child, archivedAt: undefined },
                ],
                "4",
            ),
        );
        using state = happyStateCreate({ transport: server.transport, retry: { attempts: 1 } });
        await state.syncStart();
        await state.whenIdle();

        const archivedOf = (id: string) =>
            state
                .sidebar()
                .getState()
                .chats.find((item) => item.id === id)?.chat.archivedAt;
        expect(
            state
                .sidebar()
                .getState()
                .chats.map((item) => item.id),
        ).toEqual([parent.id, child.id]);
        expect(archivedOf(parent.id)).toBeUndefined();
        expect(archivedOf(child.id)).toBeUndefined();

        server.events.sync({ sequence: "1", chats: [{ chatId: child.id, pts: "1" }], areas: [] });
        await state.whenIdle();
        expect(archivedOf(child.id)).toBe("2026-07-01T00:00:00.000Z");
        expect(archivedOf(parent.id)).toBeUndefined();

        server.events.sync({ sequence: "2", chats: [{ chatId: child.id, pts: "2" }], areas: [] });
        await state.whenIdle();
        expect(archivedOf(child.id)).toBeUndefined();

        server.events.sync({
            sequence: "3",
            chats: [
                { chatId: parent.id, pts: "1" },
                { chatId: child.id, pts: "3" },
            ],
            areas: [],
        });
        await state.whenIdle();
        expect(archivedOf(parent.id)).toBe("2026-07-02T00:00:00.000Z");
        expect(archivedOf(child.id)).toBe("2026-07-02T00:00:00.000Z");

        server.events.sync({
            sequence: "4",
            chats: [
                { chatId: parent.id, pts: "2" },
                { chatId: child.id, pts: "4" },
            ],
            areas: [],
        });
        await state.whenIdle();
        expect(archivedOf(parent.id)).toBeUndefined();
        expect(archivedOf(child.id)).toBeUndefined();
    });
});
