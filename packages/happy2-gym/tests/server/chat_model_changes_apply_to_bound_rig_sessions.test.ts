import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("chat model changes", () => {
    it("persists a catalog model and applies it to the chat's bound Rig session", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "model_change_owner" });
        const outsider = await server.createUser({ username: "model_change_outsider" });
        const asOwner = server.as(owner);
        const chatId = await createAgentChat(asOwner);

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Use the current model first",
                })
            ).statusCode,
        ).toBe(201);
        await waitForMessages(asOwner, chatId, 2);
        expect(rig.createdSessions).toHaveLength(1);

        const changed = await asOwner.post(`/v0/chats/${chatId}/changeModel`, {
            modelId: "gym/alternate-agent",
        });
        expect(changed.statusCode).toBe(200);
        expect(changed.json().chat).toMatchObject({
            id: chatId,
            agentModelId: "gym/alternate-agent",
        });
        expect(rig.modelChanges).toEqual([
            { modelId: "gym/alternate-agent", sessionId: "session-1" },
        ]);
        expect((await asOwner.get(`/v0/chats/${chatId}`)).json().chat).toMatchObject({
            agentModelId: "gym/alternate-agent",
        });

        const unavailable = await asOwner.post(`/v0/chats/${chatId}/changeModel`, {
            modelId: "gym/not-available",
        });
        expect(unavailable.statusCode).toBe(400);
        expect(unavailable.json()).toMatchObject({
            error: "invalid",
            message: "Agent model is not available",
        });
        expect(rig.modelChanges).toHaveLength(1);
        expect(
            (
                await server.as(outsider).post(`/v0/chats/${chatId}/changeModel`, {
                    modelId: "gym/mock-agent",
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

async function createAgentChat(client: GymRequestClient): Promise<string> {
    await configureAgentImage(client);
    const response = await client.post("/v0/chats/createAgent", {
        name: "Model changer",
        username: "model_changer",
    });
    expect(response.statusCode).toBe(201);
    return response.json().chat.id as string;
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    if (catalog.defaultImageId) return;
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

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
): Promise<void> {
    await waitFor(async () => {
        const messages = (await client.get(`/v0/chats/${chatId}/messages`)).json()
            .messages as Array<{
            generationStatus?: string;
            kind: string;
        }>;
        return (
            messages.length >= count &&
            messages.every(
                (message) =>
                    message.kind !== "automated" || message.generationStatus !== "streaming",
            )
        );
    }, `${count} complete messages`);
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
