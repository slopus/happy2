import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { adminLoad } from "./adminLoad.js";
import { adminStoreCreateBinding } from "./adminStore.js";

describe("admin module", () => {
    it("settles every resource independently and ignores an older overlapping load", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(403, { error: "forbidden" }));
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const admin = adminStoreCreateBinding();
        await adminLoad({ runtime, admin });
        expect(admin.store.get()).toMatchObject({
            users: { type: "error" },
            reports: { type: "ready", value: [] },
            automations: { type: "ready", value: [] },
            integrations: { type: "ready", value: [] },
        });
        runtime.stop();
        admin.dispose();
    });
});
