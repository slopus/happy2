import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { permissionAllowed, permissionsLoad, permissionsStoreCreate } from "./permissionsState.js";

describe("permissions module", () => {
    it("loads the effective projection and answers owner and grant checks", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/me",
            jsonResponse(200, {
                user: { id: "user-1", firstName: "Mia", username: "mia" },
                permissions: { allowed: ["viewAllMembers"], owner: false },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const permissions = permissionsStoreCreate();
        await permissionsLoad({ runtime, permissions });
        const snapshot = permissions.getState();
        expect(snapshot.permissions).toEqual({
            type: "ready",
            value: { allowed: ["viewAllMembers"], owner: false },
        });
        expect(permissionAllowed(snapshot, "viewAllMembers")).toBe(true);
        expect(permissionAllowed(snapshot, "manageAdminRoles")).toBe(false);
        runtime.stop();
    });

    it("treats the owner as allow-all and keeps grants stable across a refresh", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/me",
            jsonResponse(200, {
                user: { id: "user-1", firstName: "Mia", username: "mia" },
                permissions: { allowed: [], owner: true },
            }),
            jsonResponse(500, { error: "unavailable" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const permissions = permissionsStoreCreate();
        await permissionsLoad({ runtime, permissions });
        expect(permissionAllowed(permissions.getState(), "manageAdminRoles")).toBe(true);
        await permissionsLoad({ runtime, permissions });
        expect(permissions.getState().permissions).toMatchObject({
            type: "ready",
            value: { owner: true },
        });
        runtime.stop();
    });

    it("surfaces the initial load failure as a displayable error", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/me", jsonResponse(401, { error: "unauthorized" }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const permissions = permissionsStoreCreate();
        await permissionsLoad({ runtime, permissions });
        expect(permissions.getState().permissions.type).toBe("error");
        expect(permissionAllowed(permissions.getState(), "viewAllMembers")).toBe(false);
        runtime.stop();
    });
});
