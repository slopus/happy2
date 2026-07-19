import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { adminLoad } from "./adminState.js";
import { adminStoreCreate } from "./adminState.js";

describe("admin module", () => {
    it("loads one requested section without probing unrelated privileged endpoints", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(200, { users: [] }));
        const runtime = new StateRuntime({ transport: server.transport });
        const admin = adminStoreCreate();
        await adminLoad({ runtime, admin }, ["users"]);
        expect(admin.getState()).toMatchObject({
            users: { type: "ready", value: [] },
            reports: { type: "unloaded" },
            automations: { type: "unloaded" },
            integrations: { type: "unloaded" },
        });
        expect(server.requests.map(({ path }) => path)).toEqual(["/v0/admin/users"]);
        runtime.stop();
    });

    it("settles every resource independently and ignores an older overlapping load", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(403, { error: "forbidden" }));
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const admin = adminStoreCreate();
        await adminLoad({ runtime, admin });
        expect(admin.getState()).toMatchObject({
            users: { type: "error" },
            reports: { type: "ready", value: [] },
            automations: { type: "ready", value: [] },
            integrations: { type: "ready", value: [] },
        });
        runtime.stop();
    });
});
