import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { directoryLoad } from "./directoryState.js";
import { directoryStoreCreate } from "./directoryState.js";

describe("directory module", () => {
    it("loads canonical people with presence/status and keeps failures surface-local", async () => {
        const server = createFakeServer();
        const user = {
            id: "user-1",
            username: "ada",
            firstName: "Ada",
            title: "Engineer",
            role: "member",
            kind: "human",
        } as const;
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [user], presence: [], statuses: [] }),
        );
        server.respond(
            "GET",
            "/v0/presence",
            jsonResponse(200, {
                presence: [{ userId: user.id, status: "online", connectionCount: 1 }],
                statuses: [
                    {
                        userId: user.id,
                        availability: "away",
                        customStatusText: "Lunch",
                        updatedAt: "now",
                    },
                ],
            }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        const runtime = new StateRuntime({ transport: server.transport });
        const directory = directoryStoreCreate();
        await directoryLoad({ runtime, identities: new IdentityCatalog(), directory });
        expect(directory.getState().users[0]).toMatchObject({
            displayName: "Ada",
            title: "Engineer",
            presence: "online",
            availability: "away",
            customStatusText: "Lunch",
        });
        const snapshot = directory.getState();
        directory.getState().directoryInput({
            type: "presenceReconciled",
            userId: "missing",
            presence: "offline",
        });
        expect(directory.getState()).toBe(snapshot);
        runtime.stop();
    });
});
