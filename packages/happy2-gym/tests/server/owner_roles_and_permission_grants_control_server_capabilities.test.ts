import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";

const allPermissions = [
    "manageSecrets",
    "assignSecrets",
    "manageImages",
    "assignImagesToChats",
    "managePlugins",
    "viewAllMembers",
    "manageAdminRoles",
];

const adminPermissions = allPermissions.filter((permission) => permission !== "manageAdminRoles");

describe("owner, roles, and direct permission grants control server capabilities", () => {
    it("creates immutable built-in roles, makes the server creator allow-all, and joins every human as a member", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "permission_owner" });
        const member = await server.createUser({ username: "permission_member" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);

        expect((await asOwner.get("/v0/me")).json().permissions).toEqual({
            allowed: allPermissions,
            owner: true,
        });
        expect((await asMember.get("/v0/me")).json().permissions).toEqual({
            allowed: [],
            owner: false,
        });

        const catalog = await asOwner.get("/v0/admin/roles");
        expect(catalog.statusCode).toBe(200);
        expect(catalog.json().permissions).toEqual(allPermissions);
        const adminRole = builtInRole(catalog.json().roles, "admin");
        const memberRole = builtInRole(catalog.json().roles, "member");
        expect(adminRole).toMatchObject({
            name: "Admins",
            permissions: adminPermissions,
            userIds: [owner.id],
        });
        expect(memberRole).toMatchObject({
            name: "Members",
            permissions: [],
            userIds: expect.arrayContaining([owner.id, member.id]),
        });
        expect((await asMember.get("/v0/admin/roles")).statusCode).toBe(403);
        expect((await asMember.get("/v0/admin/users")).statusCode).toBe(403);

        expect(
            (
                await asOwner.post(`/v0/admin/roles/${adminRole.id}/updateRole`, {
                    name: "Operators",
                    description: "Built-in administrators with an editable label",
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/admin/roles/${memberRole.id}/updateRole`, {
                    name: "Everyone",
                    description: "Every human profile",
                })
            ).statusCode,
        ).toBe(200);
        const renamed = (await asOwner.get("/v0/admin/roles")).json().roles;
        expect(builtInRole(renamed, "admin")).toMatchObject({
            id: adminRole.id,
            name: "Operators",
            builtin: "admin",
        });
        expect(builtInRole(renamed, "member")).toMatchObject({
            id: memberRole.id,
            name: "Everyone",
            builtin: "member",
        });
        expect(
            (await asOwner.post(`/v0/admin/roles/${adminRole.id}/deleteRole`, {})).statusCode,
        ).toBe(400);
        expect(
            (await asOwner.post(`/v0/admin/roles/${memberRole.id}/deleteRole`, {})).statusCode,
        ).toBe(400);
        expect(
            (
                await asOwner.post(`/v0/admin/users/${owner.id}/unassignRole`, {
                    roleId: adminRole.id,
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asOwner.post(`/v0/admin/users/${member.id}/unassignRole`, {
                    roleId: memberRole.id,
                })
            ).statusCode,
        ).toBe(400);
    });

    it("unions custom-role and direct grants while enforcing each delegated capability independently", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "grant_owner" });
        const member = await server.createUser({ username: "grant_member" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);

        expect((await asMember.get("/v0/admin/agentSecrets")).statusCode).toBe(403);
        expect((await asMember.get("/v0/admin/agentImages")).statusCode).toBe(403);
        expect((await asMember.get("/v0/admin/plugins")).statusCode).toBe(403);

        const created = await asOwner.post("/v0/admin/roles/createRole", {
            name: "People and plugins",
            description: "Can see the directory and administer plugins",
            permissions: ["viewAllMembers", "managePlugins"],
        });
        expect(created.statusCode).toBe(201);
        const roleId = created.json().role.id as string;
        expect(
            (
                await asOwner.post(`/v0/admin/users/${member.id}/assignRole`, {
                    roleId,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asMember.get("/v0/me")).json().permissions).toEqual({
            allowed: ["managePlugins", "viewAllMembers"],
            owner: false,
        });
        expect((await asMember.get("/v0/admin/users")).statusCode).toBe(200);
        expect((await asMember.get("/v0/admin/plugins")).statusCode).toBe(200);
        expect((await asMember.get("/v0/admin/agentSecrets")).statusCode).toBe(403);
        // Plugin installation may select a ready container image, but this
        // read-only catalog access does not grant any image mutation.
        expect((await asMember.get("/v0/admin/agentImages")).statusCode).toBe(200);

        expect(
            (
                await asOwner.post(`/v0/admin/users/${member.id}/updatePermissions`, {
                    permissions: ["manageSecrets", "assignImagesToChats"],
                })
            ).statusCode,
        ).toBe(200);
        expect((await asMember.get("/v0/me")).json().permissions).toEqual({
            allowed: ["manageSecrets", "assignImagesToChats", "managePlugins", "viewAllMembers"],
            owner: false,
        });
        expect((await asMember.get("/v0/admin/agentSecrets")).statusCode).toBe(200);
        expect((await asMember.get("/v0/admin/agentImages")).statusCode).toBe(200);
        expect(
            (
                await asMember.post("/v0/admin/agentSecrets/createSecret", {
                    id: "forbidden-secret",
                    description: "Direct manage grant permits this operation",
                    environment: { TEST_SECRET: "value" },
                })
            ).statusCode,
        ).toBe(201);
        expect(
            (
                await asMember.post("/v0/admin/agentImages/createImage", {
                    name: "Forbidden image mutation",
                    dockerfile: "FROM scratch",
                })
            ).statusCode,
        ).toBe(403);

        const projection = await asOwner.get(`/v0/admin/users/${member.id}/permissions`);
        expect(projection.statusCode).toBe(200);
        expect(projection.json().permissions).toMatchObject({
            direct: ["manageSecrets", "assignImagesToChats"],
            roleIds: expect.arrayContaining([roleId]),
            effective: {
                allowed: [
                    "manageSecrets",
                    "assignImagesToChats",
                    "managePlugins",
                    "viewAllMembers",
                ],
                owner: false,
            },
        });

        expect(
            (
                await asOwner.post(`/v0/admin/users/${member.id}/unassignRole`, {
                    roleId,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asMember.get("/v0/me")).json().permissions.allowed).toEqual([
            "manageSecrets",
            "assignImagesToChats",
        ]);
        expect((await asOwner.post(`/v0/admin/roles/${roleId}/deleteRole`, {})).statusCode).toBe(
            200,
        );
    });

    it("keeps admin-role assignment owner-controlled by default and streams permission invalidations to the affected user", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "admin_owner" });
        const promoted = await server.createUser({ username: "promoted_member" });
        const other = await server.createUser({ username: "other_member" });
        const asOwner = server.as(owner);
        const asPromoted = server.as(promoted);
        const roles = (await asOwner.get("/v0/admin/roles")).json().roles;
        const adminRole = builtInRole(roles, "admin");

        const baseUrl = await server.listen();
        const controller = new AbortController();
        const response = await fetch(`${baseUrl}/v0/sync/events`, {
            headers: { authorization: `Bearer ${promoted.token}` },
            signal: controller.signal,
        });
        let frames: SseFrames | undefined;
        try {
            expect(response.ok).toBe(true);
            if (!response.body) throw new Error("SSE response did not include a body");
            frames = new SseFrames(response.body.getReader());
            const ready = await frames.next();
            const initialState = (ready.data as { state: { generation: string; sequence: string } })
                .state;

            const assigned = await asOwner.post(`/v0/admin/users/${promoted.id}/assignRole`, {
                roleId: adminRole.id,
            });
            expect(assigned.statusCode).toBe(200);
            const hint = await frames.until((frame) => frame.name === "sync");
            expect(hint.data).toMatchObject({
                sequence: assigned.json().sync.sequence,
                areas: ["permissions"],
            });
            const difference = await asPromoted.post("/v0/sync/getDifference", {
                state: initialState,
                limit: 100,
            });
            expect(difference.statusCode).toBe(200);
            expect(difference.json().areas).toContain("permissions");
            expect((await asPromoted.get("/v0/me")).json().permissions).toEqual({
                allowed: adminPermissions,
                owner: false,
            });

            expect((await asPromoted.get("/v0/admin/roles")).statusCode).toBe(403);
            expect(
                (
                    await asPromoted.post(`/v0/admin/users/${other.id}/assignRole`, {
                        roleId: adminRole.id,
                    })
                ).statusCode,
            ).toBe(403);
            expect((await asPromoted.get("/v0/admin/users")).statusCode).toBe(200);
            expect((await asPromoted.get("/v0/admin/agentSecrets")).statusCode).toBe(200);
            expect((await asPromoted.get("/v0/admin/agentImages")).statusCode).toBe(200);
            expect((await asPromoted.get("/v0/admin/plugins")).statusCode).toBe(200);

            const revoked = await asOwner.post(`/v0/admin/users/${promoted.id}/unassignRole`, {
                roleId: adminRole.id,
            });
            expect(revoked.statusCode).toBe(200);
            const revokedHint = await frames.until(
                (frame) =>
                    frame.name === "sync" &&
                    (frame.data as { sequence?: string }).sequence === revoked.json().sync.sequence,
            );
            expect(revokedHint.data).toMatchObject({ areas: ["permissions"] });
            expect((await asPromoted.get("/v0/me")).json().permissions).toEqual({
                allowed: [],
                owner: false,
            });
        } finally {
            controller.abort();
            await frames?.cancel();
        }
    });

    it("lets delegated role managers administer roles and broadcasts role-surface invalidations", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "delegation_owner" });
        const manager = await server.createUser({ username: "delegated_manager" });
        const assigned = await server.createUser({ username: "delegated_assigned" });
        const observer = await server.createUser({ username: "delegated_observer" });
        const asOwner = server.as(owner);
        const asManager = server.as(manager);
        const asAssigned = server.as(assigned);
        const asObserver = server.as(observer);

        expect(
            (
                await asOwner.post(`/v0/admin/users/${manager.id}/updatePermissions`, {
                    permissions: ["manageAdminRoles"],
                })
            ).statusCode,
        ).toBe(200);
        expect((await asManager.get("/v0/admin/roles")).statusCode).toBe(200);
        const adminRole = builtInRole((await asOwner.get("/v0/admin/roles")).json().roles, "admin");
        expect(
            (
                await asManager.post(`/v0/admin/users/${manager.id}/assignRole`, {
                    roleId: adminRole.id,
                })
            ).statusCode,
        ).toBe(200);
        const selfDemotion = await asManager.post(`/v0/admin/users/${manager.id}/unassignRole`, {
            roleId: adminRole.id,
        });
        expect(selfDemotion.statusCode).toBe(400);
        expect(selfDemotion.json().message).toBe("An administrator cannot demote themselves");

        const baseUrl = await server.listen();
        await using observerFrames = await SseFrames.open(baseUrl, observer.token);
        const observerReady = await observerFrames.next();
        const observerState = (
            observerReady.data as { state: { generation: string; sequence: string } }
        ).state;

        const created = await asManager.post("/v0/admin/roles/createRole", {
            name: "Delegated operators",
            description: "Managed without owner identity",
            permissions: [],
        });
        expect(created.statusCode).toBe(201);
        const roleId = created.json().role.id as string;
        const observerHint = await observerFrames.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { sequence?: string }).sequence === created.json().sync.sequence,
        );
        expect(observerHint.data).toMatchObject({ areas: ["permissions"] });
        const observerDifference = await asObserver.post("/v0/sync/getDifference", {
            state: observerState,
            limit: 100,
        });
        expect(observerDifference.statusCode).toBe(200);
        expect(observerDifference.json().areas).toContain("permissions");
        expect(
            (
                await asManager.post("/v0/admin/roles/createRole", {
                    name: "delegated OPERATORS",
                    permissions: [],
                })
            ).statusCode,
        ).toBe(409);

        expect(
            (
                await asManager.post(`/v0/admin/users/${assigned.id}/assignRole`, {
                    roleId,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asManager.post(`/v0/admin/users/${assigned.id}/assignRole`, {
                    roleId,
                })
            ).statusCode,
        ).toBe(200);

        await using assignedFrames = await SseFrames.open(baseUrl, assigned.token);
        await assignedFrames.next();
        const updated = await asManager.post(`/v0/admin/roles/${roleId}/updateRole`, {
            permissions: ["manageSecrets"],
        });
        expect(updated.statusCode).toBe(200);
        const assignedHint = await assignedFrames.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { sequence?: string }).sequence === updated.json().sync.sequence,
        );
        expect(assignedHint.data).toMatchObject({ areas: ["permissions"] });
        expect((await asAssigned.get("/v0/me")).json().permissions).toEqual({
            allowed: ["manageSecrets"],
            owner: false,
        });
    });
});

function agentServer(rig: MockRigDaemon) {
    return createGymServer({
        agentSandbox: new MockAgentSandboxRuntime(),
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

function builtInRole(
    roles: Array<{
        id: string;
        name: string;
        builtin: "admin" | "member" | null;
        permissions: string[];
        userIds: string[];
    }>,
    kind: "admin" | "member",
) {
    const role = roles.find(({ builtin }) => builtin === kind);
    if (!role) throw new Error(`Missing ${kind} role`);
    return role;
}

class SseFrames {
    private buffer = "";

    constructor(
        private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
        private readonly controller?: AbortController,
    ) {}

    static async open(baseUrl: string, token: string): Promise<SseFrames> {
        const controller = new AbortController();
        try {
            const response = await fetch(`${baseUrl}/v0/sync/events`, {
                headers: { authorization: `Bearer ${token}` },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`SSE request failed with HTTP ${response.status}`);
            if (!response.body) throw new Error("SSE response did not include a body");
            return new SseFrames(response.body.getReader(), controller);
        } catch (error) {
            controller.abort();
            throw error;
        }
    }

    async next(): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const delimiter = this.buffer.indexOf("\n\n");
            if (delimiter >= 0) {
                const frame = this.buffer.slice(0, delimiter);
                this.buffer = this.buffer.slice(delimiter + 2);
                const name = /^event: ([^\n]+)$/m.exec(frame)?.[1];
                const rawData = /^data: (.*)$/m.exec(frame)?.[1];
                if (name && rawData) return { name, data: JSON.parse(rawData) };
                continue;
            }
            const result = await withTimeout(this.reader.read(), 3_000);
            if (result.done) throw new Error("SSE stream ended before the expected frame");
            this.buffer += new TextDecoder().decode(result.value, { stream: true });
        }
    }

    async until(
        predicate: (frame: { name: string; data: unknown }) => boolean,
    ): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const frame = await this.next();
            if (predicate(frame)) return frame;
        }
    }

    async cancel(): Promise<void> {
        await this.reader.cancel().catch(() => undefined);
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.controller?.abort();
        await this.cancel();
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for an SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
