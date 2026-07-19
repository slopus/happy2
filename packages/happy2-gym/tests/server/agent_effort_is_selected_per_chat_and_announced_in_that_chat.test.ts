import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("chat agent effort", () => {
    it("isolates chat selections, announces real changes, survives restart, and preserves the agent default", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const admin = await server.createUser({ username: "effort_admin", firstName: "Admin" });
        const owner = await server.createUser({ username: "effort_owner", firstName: "Owner" });
        const teammate = await server.createUser({
            username: "effort_teammate",
            firstName: "Teammate",
        });
        const newcomer = await server.createUser({
            username: "effort_newcomer",
            firstName: "Newcomer",
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
        const ownerChatId = created.json().chat.id as string;
        const agentUserId = await findAgentUserId(server.as(owner), "deep_thinker");
        expect(await findAgent(server.as(owner), agentUserId)).toMatchObject({
            agentEffort: "high",
            createdByUserId: owner.id,
            kind: "agent",
        });
        expect(rig.sessionEffort("session-1")).toBe("high");

        const ownerEffortPath = `/v0/chats/${ownerChatId}/agents/${agentUserId}/effort`;
        expect((await server.get(ownerEffortPath)).statusCode).toBe(401);
        expect((await server.as(outsider).get(ownerEffortPath)).statusCode).toBe(404);

        const unsupported = await server
            .as(owner)
            .post(chatEffortChangePath(ownerChatId, agentUserId), { effort: "ultra" });
        expect(unsupported.statusCode).toBe(400);
        expect(unsupported.json()).toMatchObject({
            error: "invalid",
            message: "Effort must be one of: low, medium, high, xhigh",
        });
        expect(rig.sessionEffort("session-1")).toBe("high");

        const changed = await server
            .as(owner)
            .post(chatEffortChangePath(ownerChatId, agentUserId), { effort: "low" });
        expect(changed.statusCode).toBe(200);
        expect(changed.json()).toMatchObject({
            agentUserId,
            effort: "low",
            options: ["low", "medium", "high", "xhigh"],
            sync: {
                areas: [],
                chats: [{ chatId: ownerChatId }],
            },
        });
        expect(rig.sessionEffort("session-1")).toBe("low");
        expect(await findAgent(server.as(owner), agentUserId)).toMatchObject({
            agentEffort: "high",
        });
        expect(await effortServiceMessages(server.as(owner), ownerChatId)).toEqual([
            expect.objectContaining({
                kind: "automated",
                sender: expect.objectContaining({ id: owner.id, username: "effort_owner" }),
                service: {
                    type: "agent_effort_changed",
                    agentUserId,
                    effort: "low",
                },
                text: "@deep_thinker's reasoning effort changed to low",
            }),
        ]);

        const unchanged = await server
            .as(owner)
            .post(chatEffortChangePath(ownerChatId, agentUserId), { effort: "low" });
        expect(unchanged.statusCode).toBe(200);
        expect(unchanged.json().sync).toBeUndefined();
        expect(await effortServiceMessages(server.as(owner), ownerChatId)).toHaveLength(1);

        const teammateChat = await server.as(teammate).post("/v0/chats/createDirectMessage", {
            userId: agentUserId,
        });
        expect(teammateChat.statusCode).toBe(201);
        const teammateChatId = teammateChat.json().chat.id as string;
        expect(
            (
                await server.as(teammate).post(`/v0/chats/${teammateChatId}/sendMessage`, {
                    text: "Use the agent default",
                    clientMutationId: "inherited-default-effort",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.createdSessions.length === 2, "the teammate Rig session");
        expect(rig.createdSessions[1]).toMatchObject({ effort: "high" });
        expect(rig.sessionEffort("session-1")).toBe("low");
        expect(rig.sessionEffort("session-2")).toBe("high");

        expect(
            (
                await server
                    .as(owner)
                    .post(chatEffortChangePath(teammateChatId, agentUserId), { effort: "medium" })
            ).statusCode,
        ).toBe(404);
        const teammateChanged = await server
            .as(teammate)
            .post(chatEffortChangePath(teammateChatId, agentUserId), { effort: "xhigh" });
        expect(teammateChanged.statusCode).toBe(200);
        expect(rig.sessionEffort("session-1")).toBe("low");
        expect(rig.sessionEffort("session-2")).toBe("xhigh");
        expect(await effortServiceMessages(server.as(teammate), teammateChatId)).toEqual([
            expect.objectContaining({
                sender: expect.objectContaining({ id: teammate.id, username: "effort_teammate" }),
                service: {
                    type: "agent_effort_changed",
                    agentUserId,
                    effort: "xhigh",
                },
            }),
        ]);
        expect(await effortServiceMessages(server.as(owner), ownerChatId)).toHaveLength(1);

        await rig.restart();
        await server.restart();
        expect((await server.as(owner).get(ownerEffortPath)).json()).toEqual({
            agentUserId,
            effort: "low",
            options: ["low", "medium", "high", "xhigh"],
        });
        expect(
            (
                await server
                    .as(teammate)
                    .get(`/v0/chats/${teammateChatId}/agents/${agentUserId}/effort`)
            ).json(),
        ).toEqual({
            agentUserId,
            effort: "xhigh",
            options: ["low", "medium", "high", "xhigh"],
        });
        expect(rig.sessionEffort("session-1")).toBe("low");
        expect(rig.sessionEffort("session-2")).toBe("xhigh");

        const newcomerChat = await server.as(newcomer).post("/v0/chats/createDirectMessage", {
            userId: agentUserId,
        });
        expect(newcomerChat.statusCode).toBe(201);
        const newcomerChatId = newcomerChat.json().chat.id as string;
        expect(
            (
                await server.as(newcomer).post(`/v0/chats/${newcomerChatId}/sendMessage`, {
                    text: "Still inherit the profile default",
                    clientMutationId: "future-default-effort",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.createdSessions.length === 3, "the future Rig session");
        expect(rig.createdSessions[2]).toMatchObject({ effort: "high" });
        expect(rig.sessionEffort("session-3")).toBe("high");
    });
});

function chatEffortChangePath(chatId: string, agentUserId: string): string {
    return `/v0/chats/${chatId}/agents/${agentUserId}/changeEffort`;
}

async function effortServiceMessages(client: GymRequestClient, chatId: string) {
    const response = await client.get(`/v0/chats/${chatId}/messages`);
    expect(response.statusCode).toBe(200);
    return (response.json().messages as Array<Record<string, unknown>>).filter(
        (message) =>
            (message.service as { type?: string } | undefined)?.type === "agent_effort_changed",
    );
}

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
