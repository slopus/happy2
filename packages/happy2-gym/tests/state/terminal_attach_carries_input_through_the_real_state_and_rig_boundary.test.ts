import type { Duplex } from "node:stream";
import { RemoteTerminalProtocolClient } from "@slopus/ghostty-web";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("terminal attach across the gym state transport and Rig", () => {
    it(
        "opens an authenticated byte channel that carries input and output",
        { timeout: 30_000 },
        async () => {
            await using rig = await createMockRigDaemon();
            await using server = await agentServer(rig);
            const owner = await server.createUser({ username: "state_terminal_owner" });
            const asOwner = server.as(owner);
            await configureAgentImage(asOwner);
            const createdAgent = await asOwner.post("/v0/chats/createAgent", {
                name: "State Terminal Agent",
                username: "state_terminal_agent",
            });
            expect(createdAgent.statusCode).toBe(201);
            const chatId = (createdAgent.json().chat as { id: string }).id;
            const agentUserId = await findAgentUserId(asOwner, "state_terminal_agent");

            const transport = await createGymStateTransport(server, owner);
            const created = await transport.request<{ terminal: { id: string } }>({
                method: "POST",
                path: `/v0/chats/${chatId}/agents/${agentUserId}/terminals/createTerminal`,
                body: { cols: 80, rows: 24 },
            });
            expect(created.status).toBe(201);
            const terminalId = created.body.terminal.id;

            const connection = transport.connectTerminal({ chatId, agentUserId, terminalId });
            let sized = false;
            let exitCode: number | null | undefined;
            const client = new RemoteTerminalProtocolClient({
                clientId: "gym-state-terminal",
                capabilities: { grid: true, vt: true },
                stream: connection as unknown as Duplex,
                onExit: (code) => {
                    exitCode = code;
                },
                replica: {
                    applyGrid: () => undefined,
                    applyVt: () => undefined,
                    // The protocol applies the initial size once the welcome is parsed,
                    // proving the authenticated byte channel completed its handshake.
                    resize: () => {
                        sized = true;
                    },
                },
            });
            await client.ready;
            expect(sized).toBe(true);

            // Input travels over the channel to the exact Rig session/terminal.
            client.writeInput("pwd\r");
            await waitFor(
                () => rig.terminalInputs.some((entry) => entry.data === "pwd\r"),
                "the terminal input to reach Rig",
            );
            expect(rig.terminalInputs.at(-1)).toMatchObject({ data: "pwd\r", terminalId });

            // Stopping the terminal reports an exit over the same channel.
            expect(
                (
                    await transport.request({
                        method: "POST",
                        path: `/v0/chats/${chatId}/agents/${agentUserId}/terminals/${terminalId}/stopTerminal`,
                        body: {},
                    })
                ).status,
            ).toBe(200);
            await waitFor(() => exitCode === 0, "the terminal exit to reach the client");

            client.close();
        },
    );
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
