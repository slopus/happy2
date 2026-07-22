import { describe, expect, it } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";
import { chat } from "./fixtures.js";

function syncState(sequence: string) {
    return { protocolVersion: 1 as const, generation: "g", sequence };
}

function draftsResponse(server: ReturnType<typeof createFakeServer>) {
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: "2026-01-01T00:00:00.000Z" }),
    );
    server.respond("GET", "/v0/projects", jsonResponse(200, { projects: [] }));
}

function directoryResponses(
    server: ReturnType<typeof createFakeServer>,
    channels: readonly unknown[],
) {
    server.respond("GET", "/v0/contacts", ...channels.map(() => jsonResponse(200, { users: [] })));
    server.respond(
        "GET",
        "/v0/presence",
        ...channels.map(() => jsonResponse(200, { presence: [], statuses: [] })),
    );
    server.respond(
        "GET",
        "/v0/directory/channels",
        ...channels.map((value) => jsonResponse(200, { channels: value })),
    );
}

describe("directory surface reconciliation for chat membership", () => {
    it("reloads a retained directory for its durable area and awaited joins and leaves", async () => {
        const server = createFakeServer();
        draftsResponse(server);
        const available = chat({
            id: "alumni",
            kind: "public_channel",
            isListed: true,
            membershipRole: undefined,
            name: "Alumni",
        });
        const joined = { ...available, membershipRole: "member" as const };
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, { state: syncState("0"), serverTime: "now" }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [],
                removedChatIds: [],
                areas: ["directories"],
                state: syncState("1"),
                targetState: syncState("1"),
            }),
        );
        server.respond(
            "POST",
            `/v0/chats/${available.id}/join`,
            jsonResponse(200, { chat: joined }),
        );
        server.respond("POST", `/v0/chats/${available.id}/leave`, jsonResponse(200, {}));
        directoryResponses(server, [[available], [available], [joined], [available]]);

        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        const directory = state.directory();
        await state.whenIdle();
        expect(directory.getState().channels).toEqual([available]);

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(
            server.requests.filter(({ path }) => path === "/v0/directory/channels"),
        ).toHaveLength(2);

        await state.chatJoin(available.id);
        expect(directory.getState().channels).toEqual([joined]);

        await state.chatLeave(available.id);
        expect(directory.getState().channels).toEqual([available]);
        expect(
            server.requests.filter(({ path }) => path === "/v0/directory/channels"),
        ).toHaveLength(4);
    });

    it("does not construct a directory surface for area hints or membership actions", async () => {
        const server = createFakeServer();
        draftsResponse(server);
        const available = chat({
            id: "alumni",
            kind: "public_channel",
            isListed: true,
            membershipRole: undefined,
            name: "Alumni",
        });
        const joined = { ...available, membershipRole: "member" as const };
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, { state: syncState("0"), serverTime: "now" }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [],
                removedChatIds: [],
                areas: ["directories"],
                state: syncState("1"),
                targetState: syncState("1"),
            }),
        );
        server.respond(
            "POST",
            `/v0/chats/${available.id}/join`,
            jsonResponse(200, { chat: joined }),
        );
        server.respond("POST", `/v0/chats/${available.id}/leave`, jsonResponse(200, {}));

        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        await state.chatJoin(available.id);
        await state.chatLeave(available.id);

        expect(
            server.requests.filter(({ path }) =>
                ["/v0/contacts", "/v0/presence", "/v0/directory/channels"].includes(path),
            ),
        ).toEqual([]);
    });
});
