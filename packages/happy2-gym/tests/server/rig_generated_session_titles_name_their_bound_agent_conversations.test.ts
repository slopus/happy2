import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface Chat {
    id: string;
    name?: string;
}

describe("Rig-generated agent conversation titles", () => {
    it("names each conversation from only its own bound Rig session and exposes both through sync", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "rig_title_owner" });
        const client = server.as(owner);
        const agentUserId = await defaultAgentUserId(client);
        const first = await createConversation(client, agentUserId);
        const second = await createConversation(client, agentUserId);

        await send(client, first.id, "Repair checkout validation", "rig-title-first");
        await send(client, second.id, "Document the release flow", "rig-title-second");
        await waitFor(() => rig.submittedRuns.length === 2, "both Rig sessions to receive a turn");
        const firstRun = rig.submittedRuns.find(
            ({ text }) => text === "Repair checkout validation",
        );
        const secondRun = rig.submittedRuns.find(
            ({ text }) => text === "Document the release flow",
        );
        expect(firstRun?.sessionId).toBeDefined();
        expect(secondRun?.sessionId).toBeDefined();
        expect(firstRun!.sessionId).not.toBe(secondRun!.sessionId);

        const baseline = (await client.get("/v0/sync/state")).json().state;
        rig.emitSessionTitle(firstRun!.sessionId, "Repair checkout validation");
        rig.emitSessionTitle(secondRun!.sessionId, "Document release workflow");

        await waitFor(async () => {
            const conversations = await chats(client);
            return (
                conversations.find(({ id }) => id === first.id)?.name ===
                    "Repair checkout validation" &&
                conversations.find(({ id }) => id === second.id)?.name ===
                    "Document release workflow"
            );
        }, "both generated titles to reach the chat directory");
        expect((await client.get(`/v0/chats/${first.id}`)).json().chat.name).toBe(
            "Repair checkout validation",
        );
        expect((await client.get(`/v0/chats/${second.id}`)).json().chat.name).toBe(
            "Document release workflow",
        );

        const difference = await client.post("/v0/sync/getDifference", {
            state: baseline,
            limit: 100,
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().changedChats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: first.id, name: "Repair checkout validation" }),
                expect.objectContaining({ id: second.id, name: "Document release workflow" }),
            ]),
        );
    });
});

async function defaultAgentUserId(client: GymRequestClient): Promise<string> {
    let id: string | undefined;
    await waitFor(async () => {
        const contacts = (await client.get("/v0/contacts")).json().users as Array<{
            agentRole?: string;
            id: string;
        }>;
        id = contacts.find(({ agentRole }) => agentRole === "default")?.id;
        return id !== undefined;
    }, "the default agent identity");
    return id!;
}

async function createConversation(client: GymRequestClient, agentUserId: string): Promise<Chat> {
    const response = await client.post("/v0/chats/createAgentConversation", { agentUserId });
    expect(response.statusCode).toBe(201);
    return response.json().chat as Chat;
}

async function send(
    client: GymRequestClient,
    chatId: string,
    text: string,
    clientMutationId: string,
): Promise<void> {
    const response = await client.post(`/v0/chats/${chatId}/sendMessage`, {
        text,
        clientMutationId,
    });
    expect(response.statusCode).toBe(201);
}

async function chats(client: GymRequestClient): Promise<Chat[]> {
    const response = await client.get("/v0/chats");
    expect(response.statusCode).toBe(200);
    return response.json().chats as Chat[];
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
