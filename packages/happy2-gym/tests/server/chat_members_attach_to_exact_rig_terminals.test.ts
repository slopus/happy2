import { expect, it } from "vitest";
import { createGymServer, type GymRequestClient, type GymUser } from "../../sources/index.js";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

it("authorizes exact chat Rig terminals and carries input resize reconnect exit and cleanup", async () => {
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
    const owner = await server.createUser({ username: "terminal_owner", firstName: "Owner" });
    const outsider = await server.createUser({ username: "terminal_outsider", firstName: "Other" });
    const first = await createAgent(server.as(owner), "terminal_agent_one");
    const second = await createAgent(server.as(owner), "terminal_agent_two");
    const collectionPath = terminalCollection(first.chatId, first.agentUserId);
    const createPath = `${collectionPath}/createTerminal`;

    expect((await server.post(createPath, { cols: 80, rows: 24 })).statusCode).toBe(401);
    expect((await server.as(outsider).post(createPath, { cols: 80, rows: 24 })).statusCode).toBe(
        404,
    );
    expect(
        (
            await server
                .as(owner)
                .post(`${terminalCollection(first.chatId, second.agentUserId)}/createTerminal`, {
                    cols: 80,
                    rows: 24,
                })
        ).statusCode,
    ).toBe(404);

    const created = await server.as(owner).post(createPath, { cols: 80, rows: 24 });
    expect(created.statusCode).toBe(201);
    expect(created.json().terminal).toMatchObject({
        cols: 80,
        id: "terminal-1",
        status: "running",
        totalRows: 24,
    });
    const terminalId = created.json().terminal.id as string;
    const terminalPath = `${collectionPath}/${terminalId}`;

    expect(
        (await server.as(owner).post(`${terminalPath}/writeTerminal`, { data: "pwd\r" })).json(),
    ).toEqual({ accepted: true });
    expect(rig.terminalInputs).toEqual([{ data: "pwd\r", sessionId: "session-1", terminalId }]);
    const resized = await server
        .as(owner)
        .post(`${terminalPath}/resizeTerminal`, { cols: 132, rows: 41 });
    expect(resized.json().terminal).toMatchObject({ cols: 132, totalRows: 41, revision: 2 });
    expect(rig.terminalResizes).toEqual([
        { cols: 132, rows: 41, sessionId: "session-1", terminalId },
    ]);

    const baseUrl = await server.listen();
    const firstStream = new AbortController();
    const firstResponse = await fetch(`${baseUrl}${terminalPath}/stream?after=0`, {
        headers: authorization(owner),
        signal: firstStream.signal,
    });
    expect(firstResponse.status).toBe(200);
    const firstFrame = await readSseFrame(firstResponse);
    expect(firstFrame).toMatchObject({ revision: 2, cols: 132, status: "running" });
    firstStream.abort();
    await waitFor(() => rig.terminalStreamDisconnectCount === 1);

    const reconnect = new AbortController();
    const reconnectResponse = await fetch(`${baseUrl}${terminalPath}/stream?after=2`, {
        headers: authorization(owner),
        signal: reconnect.signal,
    });
    expect(reconnectResponse.status).toBe(200);
    await server.as(owner).post(`${terminalPath}/writeTerminal`, { data: "echo ready\r" });
    const reconnectedFrame = await readSseFrame(reconnectResponse);
    expect(reconnectedFrame).toMatchObject({ revision: 3, status: "running" });
    expect(JSON.stringify(reconnectedFrame.rows)).toContain("echo ready");

    const stopped = await server.as(owner).post(`${terminalPath}/stopTerminal`, {});
    expect(stopped.json().terminal).toMatchObject({
        exitCode: 0,
        revision: 4,
        status: "exited",
    });
    expect(
        (await server.as(owner).post(`${terminalPath}/writeTerminal`, { data: "late" })).statusCode,
    ).toBe(409);
    reconnect.abort();
    await waitFor(() => rig.terminalStreamDisconnectCount === 2);
});

function terminalCollection(chatId: string, agentUserId: string): string {
    return `/v0/chats/${chatId}/agents/${agentUserId}/terminals`;
}

async function createAgent(
    client: GymRequestClient,
    username: string,
): Promise<{ agentUserId: string; chatId: string }> {
    await configureAgentImage(client);
    const created = await client.post("/v0/chats/createAgent", { name: username, username });
    expect(created.statusCode).toBe(201);
    const contacts = (await client.get("/v0/contacts")).json().users as Array<{
        id: string;
        username: string;
    }>;
    return {
        agentUserId: contacts.find((user) => user.username === username)!.id,
        chatId: created.json().chat.id as string,
    };
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    if (catalog.defaultImageId) return;
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal")!;
    if (image.status !== "ready" && image.status !== "building")
        await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
    });
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
}

function authorization(user: GymUser): Record<string, string> {
    return { authorization: `Bearer ${user.token}` };
}

async function readSseFrame(response: Response): Promise<Record<string, unknown>> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const result = await reader.read();
        if (result.done) throw new Error("Terminal stream ended before a frame arrived");
        buffer += decoder.decode(result.value, { stream: true });
        for (const event of buffer.split("\n\n")) {
            const data = event
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
            if (data) return JSON.parse(data) as Record<string, unknown>;
        }
    }
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!(await check())) {
        if (Date.now() >= deadline) throw new Error("Timed out waiting for terminal state");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
