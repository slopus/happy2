import { PassThrough } from "node:stream";
import { happyStateCreate, type Loadable, type PluginManagementRequestSummary } from "happy2-state";
import type {
    PluginLocalOpenInput,
    PluginLocalPrepareInput,
    PluginMcpRuntime,
    PluginPackageLinkDownloader,
} from "happy2-server";
import { describe, expect, it } from "vitest";
import yazl from "yazl";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "../../sources/rig/index.js";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("agent plugin management requests across happy2-state and the real server", () => {
    it("streams pending requests into the retained chat surface and resolves decisions in place", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const runtime = new PluginDeveloperRuntime();
        const packageLink = "https://plugins.example/chat-helper.zip";
        const archive = await pluginZip();
        const downloader: PluginPackageLinkDownloader = {
            async download(url) {
                expect(url).toBe(packageLink);
                return { body: archive, url };
            },
        };
        await using server = await createGymServer({
            databaseMode: "file",
            agentSandbox: new MockAgentSandboxRuntime(),
            pluginMcpRuntime: runtime,
            pluginPackageLinkDownloader: downloader,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        runtime.requestInstall = (token, body) =>
            server.pluginHost().post("/plugin-install-requests", body, {
                headers: { authorization: `Bearer ${token}` },
            });
        runtime.requestUninstall = (token, body) =>
            server.pluginHost().post("/plugin-uninstall-requests", body, {
                headers: { authorization: `Bearer ${token}` },
            });
        const admin = await server.createUser({ username: "state_plugin_approver" });
        const client = server.as(admin);
        const installed = await client.post("/v0/admin/plugins/plugin-developer/installPlugin", {
            permissions: ["plugins:list", "plugins:request-install", "plugins:request-uninstall"],
        });
        expect(installed.statusCode).toBe(202);
        await waitForInstallation(client, installed.json().installation.id as string, "ready");
        const chatId = await createAgent(client);

        // The retained chat surface loads its (empty) request list once.
        const transport = await createGymStateTransport(server, admin);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const plugins = state.plugins();
        using chat = state.chatOpen(chatId);
        chat.getState().pluginRequestsRetain();
        await state.whenIdle();
        expect(chat.getState().pluginRequests).toEqual({ type: "ready", value: [] });

        // The agent's install request reaches the retained surface through the
        // realtime hint and the chat difference reconciliation, never a refresh.
        await agentToolCall(rig, client, chatId, "Request plugin install", {
            sourceUrl: packageLink,
            reason: "The user asked for its chat workflow.",
        });
        await expect
            .poll(() => requests(chat.getState().pluginRequests).length, { timeout: 10_000 })
            .toBe(1);
        const pending = requests(chat.getState().pluginRequests)[0]!;
        expect(pending).toMatchObject({
            action: "install",
            status: "pending",
            chatId,
            displayName: "Chat Helper",
            shortName: "chat-helper",
            reason: "The user asked for its chat workflow.",
            sourceKind: "link",
            sourceReference: packageLink,
        });

        // The staged package image travels through the authenticated transport.
        const image = await state.pluginManagementRequestImageDownload(chatId, pending.id);
        expect(image.byteLength).toBeGreaterThan(0);

        // Approving through the chat store resolves the exact request and
        // reconciles the admin plugin surface with the created installation.
        chat.getState().pluginRequestApprove(pending.id);
        expect(chat.getState().pluginRequestPendingIds).toEqual([pending.id]);
        await state.whenIdle();
        expect(chat.getState().pluginRequestPendingIds).toEqual([]);
        expect(chat.getState().pluginRequestActionError).toBeUndefined();
        const approved = requests(chat.getState().pluginRequests)[0]!;
        expect(approved).toMatchObject({ id: pending.id, status: "approved" });
        expect(approved.installationId).toBeTruthy();
        await expect
            .poll(
                () =>
                    systemPluginInstallations(plugins.getState().systemPlugins, "chat-helper")
                        .length,
                { timeout: 10_000 },
            )
            .toBe(1);
        rig.completeRun(rig.submittedRuns[0]!.runId, "The install request was approved.");

        // The agent's uninstall request arrives the same way and a denial
        // through the store leaves the installation untouched.
        await agentToolCall(rig, client, chatId, "Request plugin uninstall", {
            installationId: approved.installationId,
            reason: "The user asked to remove it.",
        });
        await expect
            .poll(
                () =>
                    requests(chat.getState().pluginRequests).find(
                        ({ action }) => action === "uninstall",
                    )?.status,
                { timeout: 10_000 },
            )
            .toBe("pending");
        const uninstall = requests(chat.getState().pluginRequests).find(
            ({ action }) => action === "uninstall",
        )!;
        chat.getState().pluginRequestDeny(uninstall.id);
        await state.whenIdle();
        expect(
            requests(chat.getState().pluginRequests).find(({ id }) => id === uninstall.id),
        ).toMatchObject({ status: "denied" });
        expect(
            systemPluginInstallations(plugins.getState().systemPlugins, "chat-helper"),
        ).toHaveLength(1);

        // A decision against an already resolved request surfaces a displayable
        // error and clears the local busy marker.
        chat.getState().chatInput({
            type: "pluginRequestReconciled",
            request: { ...uninstall, status: "pending" },
        });
        chat.getState().pluginRequestDeny(uninstall.id);
        await state.whenIdle();
        expect(chat.getState().pluginRequestPendingIds).toEqual([]);
        expect(chat.getState().pluginRequestActionError?.message).toBeTruthy();
        rig.completeRun(rig.submittedRuns[1]!.runId, "The uninstall request was denied.");
    }, 60_000);
});

function requests(
    loadable: Loadable<readonly PluginManagementRequestSummary[]>,
): readonly PluginManagementRequestSummary[] {
    return loadable.type === "ready" ? loadable.value : [];
}

function systemPluginInstallations(
    loadable: Loadable<
        readonly { readonly shortName: string; readonly installations: readonly unknown[] }[]
    >,
    shortName: string,
): readonly unknown[] {
    return loadable.type === "ready"
        ? (loadable.value.find((plugin) => plugin.shortName === shortName)?.installations ?? [])
        : [];
}

async function agentToolCall(
    rig: Awaited<ReturnType<typeof createMockRigDaemon>>,
    client: GymRequestClient,
    chatId: string,
    toolLabel: string,
    input: Record<string, unknown>,
): Promise<void> {
    const runCountBefore = rig.submittedRuns.length;
    expect(
        (
            await client.post(`/v0/chats/${chatId}/sendMessage`, {
                text: `Trigger: ${toolLabel}`,
                clientMutationId: `tool-${runCountBefore}`,
            })
        ).statusCode,
    ).toBe(201);
    await waitFor(() => rig.submittedRuns.length === runCountBefore + 1, "Rig submission");
    const run = rig.submittedRuns[runCountBefore]!;
    const tool = run.externalTools.find(({ label }) => label?.includes(toolLabel));
    if (!tool) throw new Error(`${toolLabel} tool was not submitted to Rig`);
    const callId = rig.requestExternalToolCall(run.runId, tool.name, input);
    await waitFor(
        () => rig.externalToolCalls.find(({ id }) => id === callId)?.status === "completed",
        `${toolLabel} tool completion`,
    );
}

class PluginDeveloperRuntime implements PluginMcpRuntime {
    requestInstall?: (
        token: string,
        body: Record<string, unknown>,
    ) => Promise<{ statusCode: number; json(): unknown }>;
    requestUninstall?: (
        token: string,
        body: Record<string, unknown>,
    ) => Promise<{ statusCode: number; json(): unknown }>;

    async prepareLocal(input: PluginLocalPrepareInput) {
        return {
            containerInstanceId: input.existingContainerInstanceId ?? input.containerInstanceId,
            imageTag: input.imageTag,
            reused: input.existingContainerInstanceId !== undefined,
        };
    }

    async openLocal(input: PluginLocalOpenInput) {
        const token = input.environment.HAPPY2_PLUGIN_API_TOKEN;
        if (!token) throw new Error("Plugin runtime token was not provided");
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            send: async (message) => {
                if (!("id" in message) || !("method" in message)) return;
                let result: Record<string, unknown>;
                if (message.method === "initialize") {
                    result = {
                        protocolVersion: "2025-06-18",
                        capabilities: { tools: {} },
                        serverInfo: { name: "plugin-developer-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = {
                        tools: [
                            {
                                name: "happy2_plugin_install_from_link",
                                title: "Request plugin install",
                                description: "Posts a Happy2 plugin install approval.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        sourceUrl: { type: "string" },
                                        reason: { type: "string" },
                                    },
                                    required: ["sourceUrl"],
                                    additionalProperties: false,
                                },
                            },
                            {
                                name: "happy2_plugin_uninstall",
                                title: "Request plugin uninstall",
                                description: "Posts a Happy2 plugin uninstall approval.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        installationId: { type: "string" },
                                        reason: { type: "string" },
                                    },
                                    required: ["installationId"],
                                    additionalProperties: false,
                                },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const params = message.params as {
                        name: string;
                        arguments: Record<string, unknown>;
                    };
                    const callback =
                        params.name === "happy2_plugin_uninstall"
                            ? this.requestUninstall
                            : this.requestInstall;
                    if (!callback) throw new Error("Host request callback is missing");
                    const response = await callback(token, params.arguments);
                    const body = response.json() as Record<string, unknown>;
                    if (response.statusCode !== 202)
                        throw new Error(`Plugin request failed: ${JSON.stringify(body)}`);
                    result = { content: [{ type: "text", text: JSON.stringify(body) }] };
                } else {
                    result = {};
                }
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async startLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async monitorLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async removeLocal(): Promise<void> {}

    async isLocalRunning(): Promise<boolean> {
        return true;
    }
}

async function pluginZip(): Promise<Buffer> {
    const zip = new yazl.ZipFile();
    zip.addBuffer(
        Buffer.from(
            JSON.stringify({
                schemaVersion: 1,
                version: "1.0.0",
                displayName: "Chat Helper",
                shortName: "chat-helper",
                description: "Adds a safe helper skill for the approval gym.",
                variables: [],
            }),
        ),
        "plugin.json",
    );
    zip.addBuffer(SQUARE_PNG, "plugin.png");
    zip.addBuffer(
        Buffer.from(
            "---\nname: chat-helper\ndescription: Help with the approved chat workflow.\n---\n\nUse the helper.\n",
        ),
        "skills/chat-helper/SKILL.md",
    );
    zip.end();
    const output = new PassThrough();
    zip.outputStream.pipe(output);
    const chunks: Buffer[] = [];
    for await (const chunk of output) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function createAgent(client: GymRequestClient): Promise<string> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready") {
        await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
        await waitFor(async () => {
            catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
            return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
        }, "agent image build");
    }
    await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {});
    const created = await client.post("/v0/chats/createAgent", {
        name: "Plugin Builder",
        username: "plugin_builder_agent",
    });
    expect(created.statusCode).toBe(201);
    return created.json().chat.id as string;
}

async function waitForInstallation(
    client: GymRequestClient,
    installationId: string,
    status: string,
): Promise<void> {
    await waitFor(async () => {
        const response = await client.get("/v0/admin/systemPlugins");
        if (response.statusCode !== 200)
            throw new Error(`Could not list system plugins: ${response.body}`);
        const plugins = response.json().plugins as Array<{
            installations: Array<{ id: string; status: string }>;
        }>;
        return plugins
            .flatMap(({ installations }) => installations)
            .some(
                (installation) =>
                    installation.id === installationId && installation.status === status,
            );
    }, `plugin installation ${status}`);
}

async function waitFor(
    condition: () => boolean | Promise<boolean>,
    label: string,
    timeoutMs = 20_000,
): Promise<void> {
    const startedAt = Date.now();
    for (;;) {
        if (await condition()) return;
        if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}
