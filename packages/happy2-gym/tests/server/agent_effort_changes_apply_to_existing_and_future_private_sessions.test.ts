import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("agent effort", () => {
    it("changes every existing Rig session, survives restart, and is inherited by future sessions", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const admin = await server.createUser({ username: "effort_admin", firstName: "Admin" });
        const owner = await server.createUser({ username: "effort_owner", firstName: "Owner" });
        const teammate = await server.createUser({
            username: "effort_teammate",
            firstName: "Teammate",
        });
        const outsider = await server.createUser({
            username: "effort_outsider",
            firstName: "Outsider",
        });
        await configureAgentImage(server.as(admin));

        const created = await server.as(owner).post("/v0/chats/createAgent", {
            name: "Deep Thinker",
            username: "deep_thinker",
        });
        expect(created.statusCode).toBe(201);
        const agentUserId = await findAgentUserId(server.as(owner), "deep_thinker");
        expect(await findAgent(server.as(owner), agentUserId)).toMatchObject({
            agentEffort: "high",
            createdByUserId: owner.id,
            kind: "agent",
        });
        expect(rig.sessionEffort("session-1")).toBe("high");

        expect((await server.get(`/v0/agents/${agentUserId}/effort`)).statusCode).toBe(401);
        expect((await server.as(owner).get(`/v0/agents/${owner.id}/effort`)).statusCode).toBe(404);
        expect(
            (
                await server
                    .as(outsider)
                    .post(`/v0/agents/${agentUserId}/changeEffort`, { effort: "low" })
            ).statusCode,
        ).toBe(403);

        const unsupported = await server
            .as(owner)
            .post(`/v0/agents/${agentUserId}/changeEffort`, { effort: "ultra" });
        expect(unsupported.statusCode).toBe(400);
        expect(unsupported.json()).toMatchObject({
            error: "invalid",
            message: "Effort must be one of: low, medium, high, xhigh",
        });
        expect(rig.sessionEffort("session-1")).toBe("high");

        const changed = await server
            .as(owner)
            .post(`/v0/agents/${agentUserId}/changeEffort`, { effort: "low" });
        expect(changed.statusCode).toBe(200);
        expect(changed.json()).toMatchObject({
            agent: { id: agentUserId, agentEffort: "low" },
            agentUserId,
            effort: "low",
            options: ["low", "medium", "high", "xhigh"],
            sync: { areas: ["users"] },
        });
        expect(rig.sessionEffort("session-1")).toBe("low");
        expect(await findAgent(server.as(owner), agentUserId)).toMatchObject({
            agentEffort: "low",
        });

        const teammateChat = await server.as(teammate).post("/v0/chats/createDirectMessage", {
            userId: agentUserId,
        });
        expect(teammateChat.statusCode).toBe(201);
        const teammateChatId = teammateChat.json().chat.id as string;
        expect(
            (
                await server.as(teammate).post(`/v0/chats/${teammateChatId}/sendMessage`, {
                    text: "Use the inherited effort",
                    clientMutationId: "inherited-effort",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.createdSessions.length === 2, "the second private Rig session");
        expect(rig.createdSessions[1]).toMatchObject({ effort: "low" });
        expect(rig.sessionEffort("session-2")).toBe("low");

        const adminChanged = await server
            .as(admin)
            .post(`/v0/agents/${agentUserId}/changeEffort`, { effort: "xhigh" });
        expect(adminChanged.statusCode).toBe(200);
        expect(rig.sessionEffort("session-1")).toBe("xhigh");
        expect(rig.sessionEffort("session-2")).toBe("xhigh");

        await rig.restart();
        await server.restart();
        const restored = await server.as(owner).get(`/v0/agents/${agentUserId}/effort`);
        expect(restored.statusCode).toBe(200);
        expect(restored.json()).toEqual({
            agentUserId,
            effort: "xhigh",
            options: ["low", "medium", "high", "xhigh"],
        });
        expect(await findAgent(server.as(owner), agentUserId)).toMatchObject({
            agentEffort: "xhigh",
        });
        expect(rig.sessionEffort("session-1")).toBe("xhigh");
        expect(rig.sessionEffort("session-2")).toBe("xhigh");
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

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready" && image.status !== "building") {
        const requested = await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
        expect(requested.statusCode).toBe(202);
    }
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
    }, "the agent image to build");
    const selected = await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {});
    expect(selected.statusCode).toBe(200);
}

async function findAgentUserId(client: GymRequestClient, username: string): Promise<string> {
    const contacts = (await client.get("/v0/contacts")).json().users as Array<
        Record<string, unknown>
    >;
    const agent = contacts.find((user) => user.username === username && user.kind === "agent");
    if (!agent) throw new Error(`Agent ${username} was not found`);
    return agent.id as string;
}

async function findAgent(client: GymRequestClient, agentUserId: string) {
    const contacts = (await client.get("/v0/contacts")).json().users as Array<
        Record<string, unknown>
    >;
    return contacts.find((user) => user.id === agentUserId);
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 4_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}
