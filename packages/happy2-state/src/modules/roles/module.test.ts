import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { rolesLoad, rolesOutputRoute, rolesStoreCreate } from "./rolesState.js";

const catalogPermissions = [
    "manageSecrets",
    "assignSecrets",
    "manageImages",
    "assignImagesToChats",
    "managePlugins",
    "viewAllMembers",
    "manageAdminRoles",
];

const adminsRole = {
    id: "role-admins",
    name: "Admins",
    builtin: "admin",
    permissions: catalogPermissions.filter((permission) => permission !== "manageAdminRoles"),
    userIds: ["user-owner"],
};

const contacts = {
    users: [
        { id: "user-owner", username: "owner", firstName: "Olive", role: "admin", kind: "human" },
        { id: "user-mia", username: "mia", firstName: "Mia", role: "member", kind: "human" },
        { id: "agent-1", username: "agent", firstName: "Agent", role: "member", kind: "agent" },
    ],
    presence: [],
    statuses: [],
};

function rolesResponse(roles: readonly unknown[]) {
    return jsonResponse(200, { permissions: catalogPermissions, roles });
}

describe("roles module", () => {
    it("settles the catalog and human directory independently", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/roles", jsonResponse(403, { error: "forbidden" }));
        server.respond("GET", "/v0/contacts", jsonResponse(200, contacts));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const roles = rolesStoreCreate();
        await rolesLoad({ runtime, identities: new IdentityCatalog(), roles });
        expect(roles.getState().catalog.type).toBe("error");
        expect(roles.getState().members.map((member) => member.id)).toEqual([
            "user-owner",
            "user-mia",
        ]);
        runtime.stop();
    });

    it("loads the selected member's grant detail through the selection output", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/roles", rolesResponse([adminsRole]));
        server.respond("GET", "/v0/contacts", jsonResponse(200, contacts));
        server.respond(
            "GET",
            "/v0/admin/users/user-mia/permissions",
            jsonResponse(200, {
                permissions: {
                    direct: ["manageSecrets"],
                    roleIds: ["role-admins"],
                    effective: {
                        allowed: catalogPermissions.filter(
                            (permission) => permission !== "manageAdminRoles",
                        ),
                        owner: false,
                    },
                },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        let binding: ReturnType<typeof rolesStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = rolesStoreCreate((event) =>
            routed.push(rolesOutputRoute({ runtime, identities, roles: binding }, event)),
        );
        await rolesLoad({ runtime, identities, roles: binding });
        binding.getState().memberSelect("user-mia");
        expect(binding.getState().memberDetail).toEqual({ type: "loading" });
        await Promise.all(routed);
        expect(binding.getState().memberDetail).toMatchObject({
            type: "ready",
            value: { direct: ["manageSecrets"], roleIds: ["role-admins"] },
        });
        runtime.stop();
    });

    it("routes a role mutation and re-reads the authoritative catalog", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/admin/roles",
            rolesResponse([adminsRole]),
            rolesResponse([
                adminsRole,
                {
                    id: "role-support",
                    name: "Support",
                    description: "Directory access",
                    builtin: null,
                    permissions: ["viewAllMembers"],
                    userIds: [],
                },
            ]),
        );
        server.respond("GET", "/v0/contacts", jsonResponse(200, contacts));
        server.respond(
            "POST",
            "/v0/admin/roles/createRole",
            jsonResponse(201, {
                role: {
                    id: "role-support",
                    name: "Support",
                    description: "Directory access",
                    builtin: null,
                    permissions: ["viewAllMembers"],
                    userIds: [],
                },
                sync: { sequence: "9", chats: [], areas: ["permissions"] },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        let binding: ReturnType<typeof rolesStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = rolesStoreCreate((event) =>
            routed.push(rolesOutputRoute({ runtime, identities, roles: binding }, event)),
        );
        await rolesLoad({ runtime, identities, roles: binding });
        binding.getState().roleCreate("Support", "Directory access", ["viewAllMembers"]);
        await Promise.all(routed);
        const catalog = binding.getState().catalog;
        expect(catalog).toMatchObject({ type: "ready" });
        expect(catalog.type === "ready" && catalog.value.roles).toHaveLength(2);
        const create = server.requests.find(
            (request) => request.path === "/v0/admin/roles/createRole",
        );
        expect(create?.body).toEqual({
            name: "Support",
            description: "Directory access",
            permissions: ["viewAllMembers"],
        });
        expect(create?.headers?.["idempotency-key"]).toBeTruthy();
        runtime.stop();
    });

    it("keeps the surface usable and reports a displayable error when a mutation is rejected", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/roles", rolesResponse([adminsRole]));
        server.respond("GET", "/v0/contacts", jsonResponse(200, contacts));
        server.respond(
            "POST",
            "/v0/admin/roles/role-admins/deleteRole",
            jsonResponse(400, { error: "invalid", message: "A built-in role cannot be deleted" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const identities = new IdentityCatalog();
        let binding: ReturnType<typeof rolesStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = rolesStoreCreate((event) =>
            routed.push(rolesOutputRoute({ runtime, identities, roles: binding }, event)),
        );
        await rolesLoad({ runtime, identities, roles: binding });
        binding.getState().roleDelete("role-admins");
        await Promise.all(routed);
        expect(binding.getState().actionError?.message).toBe("A built-in role cannot be deleted");
        expect(binding.getState().catalog.type).toBe("ready");
        binding.getState().memberSelect("user-mia");
        expect(binding.getState().actionError).toBeUndefined();
        runtime.stop();
    });

    it("clears a previous action error before the next typed intent", () => {
        const output = vi.fn();
        const binding = rolesStoreCreate(output);
        binding
            .getState()
            .rolesInput({ type: "roleActionFailed", error: new Error("bad") as never });
        binding.getState().memberRoleAssign("user-mia", "role-admins");
        expect(binding.getState().actionError).toBeUndefined();
        expect(output).toHaveBeenCalledWith({
            type: "memberRoleAssignSubmitted",
            userId: "user-mia",
            roleId: "role-admins",
        });
    });

    it("ignores a stale member detail after the selection changes", () => {
        const binding = rolesStoreCreate();
        binding.getState().memberSelect("user-mia");
        binding.getState().memberSelect("user-owner");
        binding.getState().rolesInput({
            type: "memberDetailLoaded",
            userId: "user-mia",
            detail: { direct: [], roleIds: [], effective: { allowed: [], owner: false } },
        });
        expect(binding.getState().memberDetail).toEqual({ type: "loading" });
    });
});
