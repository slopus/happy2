import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("Rig-backed agent secrets", () => {
    it("lists masked registrations and applies durable agent and channel assignments", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const admin = await server.createUser({ username: "secret_admin", firstName: "Admin" });
        const teammate = await server.createUser({
            username: "secret_teammate",
            firstName: "Teammate",
        });
        const asAdmin = server.as(admin);
        await configureAgentImage(asAdmin);

        const createdAgent = await asAdmin.post("/v0/chats/createAgent", {
            name: "Secret Worker",
            username: "secret_worker",
        });
        expect(createdAgent.statusCode).toBe(201);
        const ownerChatId = createdAgent.json().chat.id as string;
        const agentUserId = await findAgentUserId(asAdmin, "secret_worker");

        expect((await server.as(teammate).get("/v0/admin/agentSecrets")).statusCode).toBe(403);

        const token = "must-only-live-inside-rig";
        const created = await asAdmin.post("/v0/admin/agentSecrets/createSecret", {
            id: "service-api",
            description: "Service API credentials",
            environment: {
                SERVICE_API_TOKEN: token,
                SERVICE_API_REGION: "west",
            },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().secret).toEqual({
            id: "service-api",
            description: "Service API credentials",
            environmentVariables: ["SERVICE_API_TOKEN", "SERVICE_API_REGION"],
            agentUserIds: [],
            channelIds: [],
        });
        expect(created.body).not.toContain(token);
        expect(rig.secretEnvironment("service-api")).toEqual({
            SERVICE_API_TOKEN: token,
            SERVICE_API_REGION: "west",
        });

        const attached = await asAdmin.post("/v0/admin/agentSecrets/service-api/attachToAgent", {
            agentUserId,
        });
        expect(attached.statusCode).toBe(200);
        expect(attached.json().secret.agentUserIds).toEqual([agentUserId]);
        expect(rig.sessionSecretIds("session-1")).toEqual(["service-api"]);

        const teammateDm = await server.as(teammate).post("/v0/chats/createDirectMessage", {
            userId: agentUserId,
        });
        expect(teammateDm.statusCode).toBe(201);
        const teammateChatId = teammateDm.json().chat.id as string;
        expect(
            (
                await server.as(teammate).post(`/v0/chats/${teammateChatId}/sendMessage`, {
                    text: "Use the service when needed.",
                    clientMutationId: "future-agent-secret-session",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.createdSessions.length === 2, "the second agent session");
        expect(rig.sessionSecretIds("session-2")).toEqual(["service-api"]);

        const createdChannel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Deployments",
            slug: "secret-deployments",
        });
        expect(createdChannel.statusCode).toBe(201);
        const channelId = createdChannel.json().chat.id as string;
        expect(
            (
                await asAdmin.post(`/v0/chats/${channelId}/addMember`, {
                    userId: agentUserId,
                })
            ).statusCode,
        ).toBe(200);
        const channelAttached = await asAdmin.post(
            "/v0/admin/agentSecrets/service-api/attachToChannel",
            { channelId },
        );
        expect(channelAttached.statusCode).toBe(200);
        expect(channelAttached.json().secret.channelIds).toEqual([channelId]);

        await rig.restart();
        await server.restart();
        const afterRestart = await asAdmin.get("/v0/admin/agentSecrets");
        expect(afterRestart.statusCode).toBe(200);
        expect(afterRestart.json().secrets).toEqual([
            {
                id: "service-api",
                description: "Service API credentials",
                environmentVariables: ["SERVICE_API_TOKEN", "SERVICE_API_REGION"],
                agentUserIds: [agentUserId],
                channelIds: [channelId],
            },
        ]);
        expect(afterRestart.body).not.toContain(token);
        expect(rig.sessionSecretIds("session-1")).toEqual(["service-api"]);
        expect(rig.sessionSecretIds("session-2")).toEqual(["service-api"]);

        const detached = await asAdmin.post("/v0/admin/agentSecrets/service-api/detachFromAgent", {
            agentUserId,
        });
        expect(detached.statusCode).toBe(200);
        expect(detached.json().secret.agentUserIds).toEqual([]);
        expect(detached.json().secret.channelIds).toEqual([channelId]);
        expect(rig.sessionSecretIds("session-1")).toEqual([]);
        expect(rig.sessionSecretIds("session-2")).toEqual([]);

        const deleted = await asAdmin.post("/v0/admin/agentSecrets/service-api/deleteSecret", {});
        expect(deleted.statusCode).toBe(200);
        expect(deleted.json().removed).toBe(true);
        expect(rig.secretEnvironment("service-api")).toBeUndefined();
        expect((await asAdmin.get("/v0/admin/agentSecrets")).json().secrets).toEqual([]);

        const state = (await asAdmin.get("/v0/sync/state")).json().state;
        const difference = await asAdmin.post("/v0/sync/getDifference", {
            state: {
                generation: state.generation,
                sequence: created.json().sync.sequence,
            },
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().areas).toContain("agent-secrets");

        expect(ownerChatId).not.toBe(teammateChatId);
    });

    it("rejects invalid registrations and non-agent or non-channel targets", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const admin = await server.createUser({ username: "secret_validator" });
        const human = await server.createUser({ username: "secret_human" });
        const asAdmin = server.as(admin);

        const invalid = await asAdmin.post("/v0/admin/agentSecrets/createSecret", {
            id: "bad id",
            description: "Invalid",
            environment: { TOKEN: "hidden" },
        });
        expect(invalid.statusCode).toBe(400);
        expect(rig.secretEnvironment("bad id")).toBeUndefined();

        expect(
            (
                await asAdmin.post("/v0/admin/agentSecrets/createSecret", {
                    id: "valid-secret",
                    description: "Valid",
                    environment: { TOKEN: "hidden" },
                })
            ).statusCode,
        ).toBe(201);
        expect(
            (
                await asAdmin.post("/v0/admin/agentSecrets/valid-secret/attachToAgent", {
                    agentUserId: human.id,
                })
            ).statusCode,
        ).toBe(404);

        const direct = await asAdmin.post("/v0/chats/createDirectMessage", { userId: human.id });
        expect(
            (
                await asAdmin.post("/v0/admin/agentSecrets/valid-secret/attachToChannel", {
                    channelId: direct.json().chat.id,
                })
            ).statusCode,
        ).toBe(404);
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
    }, "the default agent image to build");
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

async function waitFor(
    condition: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
