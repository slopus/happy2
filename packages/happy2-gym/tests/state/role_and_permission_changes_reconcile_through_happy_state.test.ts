import { happyStateCreate, type PermissionsSnapshot, type RolesSnapshot } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("roles and permissions across happy2-state and the real server", () => {
    it("routes typed role intents and refetches affected member permissions over realtime", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "state_permission_owner" });
        const member = await server.createUser({ username: "state_permission_member" });

        const ownerTransport = await createGymStateTransport(server, owner);
        await using ownerState = happyStateCreate({
            initialPermissions: { allowed: [], owner: true },
            transport: ownerTransport,
        });
        await ownerState.syncStart();
        await ownerTransport.whenConnected();
        const roles = ownerState.roles();
        await ownerState.whenIdle();
        expect(readyRoles(roles.getState()).map(({ builtin }) => builtin)).toEqual([
            "admin",
            "member",
        ]);

        const memberTransport = await createGymStateTransport(server, member);
        await using memberState = happyStateCreate({
            initialPermissions: { allowed: [], owner: false },
            transport: memberTransport,
        });
        await memberState.syncStart();
        await memberTransport.whenConnected();
        const memberPermissions = memberState.permissions();
        await memberState.whenIdle();
        expect(allowed(memberPermissions.getState())).toEqual([]);

        roles.getState().roleCreate("Operators", "Runs protected services", ["manageSecrets"]);
        await ownerState.whenIdle();
        const operators = readyRoles(roles.getState()).find(({ name }) => name === "Operators");
        expect(operators).toBeDefined();

        roles.getState().memberSelect(member.id);
        await ownerState.whenIdle();
        expect(roles.getState().memberDetail).toMatchObject({
            type: "ready",
            value: { direct: [], roleIds: ["happy2_builtin_members"] },
        });

        roles.getState().memberRoleAssign(member.id, operators!.id);
        await ownerState.whenIdle();
        await expect
            .poll(() => allowed(memberPermissions.getState()), { timeout: 5_000 })
            .toEqual(["manageSecrets"]);

        roles.getState().memberPermissionsUpdate(member.id, ["managePlugins"]);
        await ownerState.whenIdle();
        await expect
            .poll(() => allowed(memberPermissions.getState()), { timeout: 5_000 })
            .toEqual(["manageSecrets", "managePlugins"]);

        roles.getState().memberRoleUnassign(member.id, operators!.id);
        await ownerState.whenIdle();
        await expect
            .poll(() => allowed(memberPermissions.getState()), { timeout: 5_000 })
            .toEqual(["managePlugins"]);
        expect(roles.getState().memberDetail).toMatchObject({
            type: "ready",
            value: { direct: ["managePlugins"], roleIds: ["happy2_builtin_members"] },
        });
    });
});

function readyRoles(snapshot: RolesSnapshot) {
    return snapshot.catalog.type === "ready" ? snapshot.catalog.value.roles : [];
}

function allowed(snapshot: PermissionsSnapshot) {
    return snapshot.permissions.type === "ready" ? snapshot.permissions.value.allowed : [];
}
