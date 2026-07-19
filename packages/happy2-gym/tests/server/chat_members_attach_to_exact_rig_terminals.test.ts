import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGymServer, type GymRequestClient, type GymUser } from "../../sources/index.js";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { startWebHappy2 } from "happy2-server";
import WebSocket, { createWebSocketStream } from "ws";
import {
    RemoteTerminalProtocolClient,
    type RemoteTerminalGridState,
    type RemoteTerminalReconnectState,
} from "@slopus/ghostty-web";

it("starts one exact chat agent session when terminals open before any turn", async () => {
    await using rig = await createMockRigDaemon();
    const sandbox = new MockAgentSandboxRuntime();
    await using server = await createGymServer({
        agentSandbox: sandbox,
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
    const owner = await server.createUser({ username: "terminal_lazy_owner", firstName: "Owner" });
    const agent = await createAgent(server.as(owner), "terminal_lazy_agent");
    const conversation = await server.as(owner).post("/v0/chats/createAgentConversation", {
        agentUserId: agent.agentUserId,
    });
    expect(conversation.statusCode).toBe(201);
    const chatId = conversation.json().chat.id as string;
    const sessionsBefore = rig.createdSessions.length;
    const containersBefore = sandbox.createdContainers.length;
    const createPath = `${terminalCollection(chatId, agent.agentUserId)}/createTerminal`;

    const [first, second] = await Promise.all([
        server.as(owner).post(createPath, { cols: 80, rows: 24 }),
        server.as(owner).post(createPath, { cols: 132, rows: 41 }),
    ]);

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(rig.createdSessions).toHaveLength(sessionsBefore + 1);
    expect(sandbox.createdContainers).toHaveLength(containersBefore + 1);
    expect([first.json().terminal, second.json().terminal]).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ cols: 80, rows: 24, status: "running" }),
            expect.objectContaining({ cols: 132, rows: 41, status: "running" }),
        ]),
    );
});

it("authorizes exact chat Rig terminals and carries protocol input resize reconnect exit and cleanup", async () => {
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
        rows: 24,
        status: "running",
    });
    const terminalId = created.json().terminal.id as string;
    const terminalPath = `${collectionPath}/${terminalId}`;
    const backendUrl = await server.listen();
    await using web = await startGymWebGateway(backendUrl);
    const baseUrl = web.url;
    const attachPath = `${terminalPath}/attach`;

    expect(await webSocketStatus(backendUrl, attachPath)).toBe(401);
    expect(await webSocketStatus(backendUrl, attachPath, owner, false)).toBe(400);
    expect(await webSocketStatus(backendUrl, attachPath, outsider)).toBe(404);
    expect(
        await webSocketStatus(
            backendUrl,
            `${terminalCollection(first.chatId, second.agentUserId)}/${terminalId}/attach`,
            owner,
        ),
    ).toBe(404);
    expect(
        await webSocketStatus(backendUrl, `${collectionPath}/missing-terminal/attach`, owner),
    ).toBe(404);
    for (const [rigStatus, serverStatus] of [
        [400, 400],
        [409, 409],
        [418, 502],
    ] as const) {
        rig.rejectNextTerminalAttachment(rigStatus);
        expect(await webSocketStatus(backendUrl, attachPath, owner)).toBe(serverStatus);
    }

    const view = terminalView();
    const firstAttachment = await attachTerminal(baseUrl, attachPath, owner, view);
    firstAttachment.protocol.writeInput("pwd\r");
    await waitFor(() => rig.terminalInputs.length === 1 && view.rendered().includes("pwd"));
    expect(rig.terminalInputs).toEqual([{ data: "pwd\r", sessionId: "session-1", terminalId }]);
    await firstAttachment.protocol.resize(132, 41);
    expect(rig.terminalResizes).toEqual([
        { cols: 132, rows: 41, sessionId: "session-1", terminalId },
    ]);
    expect(view.size).toEqual({ cols: 132, rows: 41 });

    const reconnectState = firstAttachment.protocol.reconnectState();
    firstAttachment.close();
    await waitFor(() => rig.terminalAttachmentDisconnectCount === 1);
    const reconnected = await attachTerminal(baseUrl, attachPath, owner, view, {
        reconnectState,
    });
    reconnected.protocol.writeInput("echo ready\r");
    await waitFor(() => rig.terminalInputs.length === 2 && view.rendered().includes("echo ready"));

    const stopped = await server.as(owner).post(`${terminalPath}/stopTerminal`, {});
    expect(stopped.json().terminal).toMatchObject({
        exitCode: 0,
        rows: 41,
        status: "exited",
    });
    await expect(reconnected.exited).resolves.toBe(0);
    reconnected.close();
    await waitFor(() => rig.terminalAttachmentDisconnectCount === 2);

    const oversized = await server.as(owner).post(createPath, { cols: 80, rows: 24 });
    const oversizedTerminalId = oversized.json().terminal.id as string;
    const disconnectsBeforeOversizedFrame = rig.terminalAttachmentDisconnectCount;
    expect(
        await oversizedFrameCloseCode(
            backendUrl,
            `${collectionPath}/${oversizedTerminalId}/attach`,
            owner,
        ),
    ).toBe(1009);
    await waitFor(
        () => rig.terminalAttachmentDisconnectCount === disconnectsBeforeOversizedFrame + 1,
    );
    expect((await server.as(owner).get("/v0/contacts")).statusCode).toBe(200);
}, 15_000);

const TERMINAL_PROTOCOL = "happy2-terminal.v1";
const MAX_TERMINAL_WIRE_BYTES = 4 * 1024 * 1024 + 20;

interface TerminalView {
    grid?: RemoteTerminalGridState;
    size?: { cols: number; rows: number };
    vt: string;
    rendered(): string;
}

function terminalView(): TerminalView {
    return {
        vt: "",
        rendered() {
            const grid =
                this.grid?.rows.flatMap((row) => row.cells.map((cell) => cell.text)).join("") ?? "";
            return `${grid}${this.vt}`;
        },
    };
}

async function attachTerminal(
    baseUrl: string,
    path: string,
    user: GymUser,
    view: TerminalView,
    options: { reconnectState?: RemoteTerminalReconnectState } = {},
): Promise<{
    close(): void;
    exited: Promise<number | null>;
    protocol: RemoteTerminalProtocolClient;
}> {
    const webSocket = new WebSocket(webSocketUrl(baseUrl, path), [
        TERMINAL_PROTOCOL,
        `happy2-auth.${user.token}`,
    ]);
    await new Promise<void>((resolve, reject) => {
        webSocket.once("open", resolve);
        webSocket.once("error", reject);
    });
    const stream = createWebSocketStream(webSocket, { allowHalfOpen: false });
    let exitResolve!: (exitCode: number | null) => void;
    const exited = new Promise<number | null>((resolve) => {
        exitResolve = resolve;
    });
    const reconnect = options.reconnectState;
    const protocol = new RemoteTerminalProtocolClient({
        clientId: "happy2-gym-terminal-client",
        ...(reconnect?.epoch === undefined ? {} : { epoch: reconnect.epoch }),
        ...(reconnect?.inputLease === undefined ? {} : { inputLease: reconnect.inputLease }),
        ...(reconnect
            ? {
                  pendingInputs: reconnect.pendingInputs,
                  resumeInputSequence: reconnect.resumeInputSequence,
                  resumeOutputOffset: reconnect.resumeOutputOffset,
              }
            : {}),
        onExit: exitResolve,
        replica: {
            applyGrid(grid) {
                view.grid = grid;
            },
            applyVt(data) {
                view.vt += Buffer.from(data).toString("utf8");
            },
            resize(cols, rows) {
                view.size = { cols, rows };
            },
        },
        stream,
    });
    await protocol.ready;
    expect(webSocket.protocol).toBe(TERMINAL_PROTOCOL);
    return {
        close() {
            protocol.close();
            webSocket.terminate();
        },
        exited,
        protocol,
    };
}

async function webSocketStatus(
    baseUrl: string,
    path: string,
    user?: GymUser,
    includeProtocol = true,
): Promise<number> {
    const protocols = [
        ...(includeProtocol ? [TERMINAL_PROTOCOL] : []),
        ...(user ? [`happy2-auth.${user.token}`] : []),
    ];
    const webSocket = new WebSocket(webSocketUrl(baseUrl, path), protocols);
    return await new Promise<number>((resolve, reject) => {
        webSocket.once("unexpected-response", (_request, response) => {
            const status = response.statusCode ?? 500;
            response.resume();
            webSocket.terminate();
            resolve(status);
        });
        webSocket.once("open", () => {
            webSocket.terminate();
            reject(new Error("WebSocket unexpectedly connected"));
        });
        webSocket.once("error", reject);
    });
}

async function oversizedFrameCloseCode(
    baseUrl: string,
    path: string,
    user: GymUser,
): Promise<number> {
    const webSocket = new WebSocket(webSocketUrl(baseUrl, path), [
        TERMINAL_PROTOCOL,
        `happy2-auth.${user.token}`,
    ]);
    await new Promise<void>((resolve, reject) => {
        webSocket.once("open", resolve);
        webSocket.once("error", reject);
    });
    const closed = new Promise<number>((resolve) => {
        webSocket.once("close", resolve);
        webSocket.once("error", () => undefined);
    });
    webSocket.send(Buffer.alloc(MAX_TERMINAL_WIRE_BYTES + 1));
    return closed;
}

function webSocketUrl(baseUrl: string, path: string): string {
    const url = new URL(path, baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

async function startGymWebGateway(backendUrl: string): Promise<AsyncDisposable & { url: string }> {
    const webRoot = await mkdtemp(join(tmpdir(), "happy2-terminal-web-"));
    try {
        await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Gym</title>\n");
        const running = await startWebHappy2({
            backendUrl,
            host: "127.0.0.1",
            logger: false,
            port: 0,
            webRoot,
        });
        return {
            url: running.url,
            async [Symbol.asyncDispose]() {
                await running.close();
                await rm(webRoot, { force: true, recursive: true });
            },
        };
    } catch (error) {
        await rm(webRoot, { force: true, recursive: true });
        throw error;
    }
}

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

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!(await check())) {
        if (Date.now() >= deadline) throw new Error("Timed out waiting for terminal state");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
