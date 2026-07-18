import { happyStateCreate, type AgentSecretsSnapshot } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("agent secrets across happy2-state and Rig", () => {
    it("keeps values inside Rig while typed state actions and realtime expose masked metadata", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const admin = await server.createUser({ username: "state_secret_admin" });
        const asAdmin = server.as(admin);
        await configureAgentImage(asAdmin);
        const createdAgent = await asAdmin.post("/v0/chats/createAgent", {
            name: "State Secret Agent",
            username: "state_secret_agent",
        });
        expect(createdAgent.statusCode).toBe(201);
        const agentUserId = await findAgentUserId(asAdmin, "state_secret_agent");

        const transport = await createGymStateTransport(server, admin);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const secrets = state.agentSecrets();
        await state.whenIdle();
        expect(secrets.getState().secrets).toEqual({ type: "ready", value: [] });

        const value = "real-rig-only-secret-value";
        secrets.getState().secretCreate("state-service", "State service credentials", {
            STATE_SERVICE_TOKEN: value,
        });
        await state.whenIdle();
        expect(readySecrets(secrets.getState().secrets)[0]).toEqual({
            id: "state-service",
            description: "State service credentials",
            environmentVariables: ["STATE_SERVICE_TOKEN"],
            agentUserIds: [],
            channelIds: [],
        });
        expect(JSON.stringify(secrets.getState())).not.toContain(value);
        expect(rig.secretEnvironment("state-service")).toEqual({ STATE_SERVICE_TOKEN: value });

        secrets.getState().secretAgentAttach("state-service", agentUserId);
        await state.whenIdle();
        expect(readySecrets(secrets.getState().secrets)[0]).toMatchObject({
            id: "state-service",
            agentUserIds: [agentUserId],
        });
        expect(rig.sessionSecretIds("session-1")).toEqual(["state-service"]);

        const deleted = await asAdmin.post("/v0/admin/agentSecrets/state-service/deleteSecret", {});
        expect(deleted.statusCode).toBe(200);
        await expect
            .poll(() => readySecrets(secrets.getState().secrets), { timeout: 3_000 })
            .toEqual([]);
        expect(rig.secretEnvironment("state-service")).toBeUndefined();
        expect(rig.sessionSecretIds("session-1")).toEqual([]);
    });
});

function readySecrets(value: AgentSecretsSnapshot["secrets"]) {
    if (value.type !== "ready") throw new Error(`Expected ready secrets, received ${value.type}`);
    return value.value;
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
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
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
