import { PassThrough } from "node:stream";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import yazl from "yazl";
import type {
    PluginLocalOpenInput,
    PluginLocalPrepareInput,
    PluginMcpRuntime,
    PluginPackageLinkDownloader,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("agent-requested plugin installation", () => {
    it("binds a validated linked package to the exact chat and waits for administrator approval", async () => {
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
        const admin = await server.createUser({ username: "plugin_approval_admin" });
        const outsider = await server.createUser({ username: "plugin_approval_outsider" });
        const client = server.as(admin);

        const installed = await client.post("/v0/admin/plugins/plugin-developer/installPlugin", {
            permissions: ["plugins:list", "plugins:request-install", "plugins:request-uninstall"],
        });
        expect(installed.statusCode).toBe(202);
        const developerInstallationId = installed.json().installation.id as string;
        await waitForInstallation(client, developerInstallationId, "ready");
        expect(runtime.nonContextualTokens.length).toBeGreaterThan(0);
        const rejected = await server.pluginHost().post(
            "/plugin-install-requests",
            { sourceUrl: packageLink },
            {
                headers: {
                    authorization: `Bearer ${runtime.nonContextualTokens[0]}`,
                },
            },
        );
        expect(rejected.statusCode).toBe(403);
        expect(rejected.json().message).toContain("active Happy agent call");

        const chatId = await createAgent(client);
        expect(
            (
                await client.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Install the linked chat helper plugin.",
                    clientMutationId: "request-plugin-install",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
        const run = rig.submittedRuns[0]!;
        const developerSkill = run.skills.find(({ name }) => name === "happy2-plugin-development");
        if (!developerSkill) throw new Error("Plugin developer durable skill was not submitted");
        expect(developerSkill).toMatchObject({
            location: "durable",
            description: expect.stringContaining("Build, package, validate, install"),
        });
        const tool = run.externalTools.find(({ label }) =>
            label?.includes("Request plugin install"),
        );
        if (!tool) throw new Error("Plugin developer install tool was not submitted to Rig");
        const callId = rig.requestExternalToolCall(run.runId, tool.name, {
            sourceUrl: packageLink,
            reason: "The user asked for its chat workflow.",
        });
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === callId)?.status === "completed",
            "plugin request tool completion",
        );
        expect(runtime.contextualTokens).toHaveLength(1);
        expect(
            (
                await server.pluginHost().post(
                    "/plugin-install-requests",
                    { sourceUrl: packageLink },
                    {
                        headers: {
                            authorization: `Bearer ${runtime.contextualTokens[0]}`,
                        },
                    },
                )
            ).statusCode,
        ).toBe(403);

        const listed = await client.get(`/v0/chats/${chatId}/pluginManagementRequests`);
        expect(listed.statusCode).toBe(200);
        expect(listed.json().requests).toHaveLength(1);
        const request = listed.json().requests[0] as Record<string, string>;
        expect(request).toMatchObject({
            action: "install",
            status: "pending",
            chatId,
            displayName: "Chat Helper",
            shortName: "chat-helper",
            description: "Adds a safe helper skill for the approval gym.",
            reason: "The user asked for its chat workflow.",
            requesterInstallationId: developerInstallationId,
            sourceKind: "link",
            sourceReference: packageLink,
        });
        expect(
            (await server.as(outsider).get(`/v0/chats/${chatId}/pluginManagementRequests`))
                .statusCode,
        ).toBe(403);
        expect(
            (await client.get(`/v0/chats/${chatId}/pluginManagementRequests/${request.id}/image`))
                .rawPayload,
        ).toEqual(SQUARE_PNG);

        const approved = await client.post(
            `/v0/chats/${chatId}/pluginManagementRequests/${request.id}/approvePluginInstall`,
            {},
        );
        expect(approved.statusCode).toBe(200);
        expect(approved.json().approval).toMatchObject({
            id: request.id,
            status: "approved",
            shortName: "chat-helper",
        });
        expect(approved.json().approval.imageUrl).toBeUndefined();
        expect(
            (await client.get(`/v0/chats/${chatId}/pluginManagementRequests/${request.id}/image`))
                .statusCode,
        ).toBe(404);
        await expect(
            access(join(server.config.plugins.directory, ".requests", request.id)),
        ).rejects.toMatchObject({ code: "ENOENT" });
        const installationId = approved.json().approval.installationId as string;
        await waitForInstallation(client, installationId, "ready");
        expect(
            (
                await client.post(
                    `/v0/chats/${chatId}/pluginManagementRequests/${request.id}/approvePluginInstall`,
                    {},
                )
            ).statusCode,
        ).toBe(409);

        rig.completeRun(run.runId, "The install request was approved.");
        await waitForMessages(client, chatId, 2);
        expect(
            (
                await client.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Now uninstall that chat helper plugin.",
                    clientMutationId: "request-plugin-uninstall",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 2, "second Rig submission");
        const secondRun = rig.submittedRuns[1]!;
        const uninstallTool = secondRun.externalTools.find(({ label }) =>
            label?.includes("Request plugin uninstall"),
        );
        if (!uninstallTool) throw new Error("Plugin developer uninstall tool was not submitted");
        const uninstallCallId = rig.requestExternalToolCall(secondRun.runId, uninstallTool.name, {
            installationId,
            reason: "The user asked to remove it.",
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === uninstallCallId)?.status ===
                "completed",
            "plugin uninstall request tool completion",
        );
        const requests = (await client.get(`/v0/chats/${chatId}/pluginManagementRequests`)).json()
            .requests as Array<Record<string, string>>;
        const uninstallRequest = requests.find(({ action }) => action === "uninstall");
        expect(uninstallRequest).toMatchObject({
            action: "uninstall",
            status: "pending",
            targetInstallationId: installationId,
            displayName: "Chat Helper",
            reason: "The user asked to remove it.",
        });
        expect(
            (
                await client.post(
                    `/v0/chats/${chatId}/pluginManagementRequests/${uninstallRequest!.id}/denyPluginInstall`,
                    {},
                )
            ).statusCode,
        ).toBe(409);
        const uninstallApproval = await client.post(
            `/v0/chats/${chatId}/pluginManagementRequests/${uninstallRequest!.id}/approvePluginUninstall`,
            {},
        );
        expect(uninstallApproval.statusCode).toBe(200);
        expect(uninstallApproval.json().approval).toMatchObject({
            action: "uninstall",
            status: "approved",
            targetInstallationId: installationId,
        });
        await expect(
            access(join(server.config.plugins.directory, ".requests", uninstallRequest!.id)),
        ).rejects.toMatchObject({ code: "ENOENT" });
        expect(await hasSystemPlugin(client, "chat-helper")).toBe(false);

        rig.completeRun(secondRun.runId, "The uninstall request was approved.");
        await waitForMessages(client, chatId, 4);
        expect(
            (
                await client.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Request it again, but I may deny it.",
                    clientMutationId: "request-plugin-install-to-deny",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 3, "third Rig submission");
        const thirdRun = rig.submittedRuns[2]!;
        const reinstallTool = thirdRun.externalTools.find(({ label }) =>
            label?.includes("Request plugin install"),
        );
        if (!reinstallTool) throw new Error("Plugin developer install tool was not resubmitted");
        const deniedCallId = rig.requestExternalToolCall(thirdRun.runId, reinstallTool.name, {
            sourceUrl: packageLink,
            reason: "The user asked to review it again.",
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === deniedCallId)?.status === "completed",
            "second plugin install request tool completion",
        );
        const afterReinstall = (
            await client.get(`/v0/chats/${chatId}/pluginManagementRequests`)
        ).json().requests as Array<Record<string, string>>;
        const pendingInstall = afterReinstall.find(
            ({ action, status }) => action === "install" && status === "pending",
        );
        if (!pendingInstall) throw new Error("Pending install request was not found for denial");
        const denied = await client.post(
            `/v0/chats/${chatId}/pluginManagementRequests/${pendingInstall.id}/denyPluginInstall`,
            {},
        );
        expect(denied.statusCode).toBe(200);
        expect(denied.json().approval).toMatchObject({
            action: "install",
            status: "denied",
            shortName: "chat-helper",
        });
        expect(denied.json().approval.imageUrl).toBeUndefined();
        await expect(
            access(join(server.config.plugins.directory, ".requests", pendingInstall.id)),
        ).rejects.toMatchObject({ code: "ENOENT" });
        expect(await hasSystemPlugin(client, "chat-helper")).toBe(false);
        const audit = await client.get(
            "/v0/admin/auditLogs?targetType=plugin_management_request&limit=20",
        );
        expect(audit.statusCode).toBe(200);
        expect(
            (audit.json().auditLogs as Array<{ action: string }>).map(({ action }) => action),
        ).toEqual(
            expect.arrayContaining([
                "plugin.install_requested",
                "plugin.install_approved",
                "plugin.uninstall_requested",
                "plugin.uninstall_approved",
                "plugin.install_denied",
            ]),
        );

        rig.completeRun(thirdRun.runId, "The repeated install request was denied.");
        await waitForMessages(client, chatId, 6);
        await server.restart({
            beforeStart: async () => {
                const database = createClient({ url: server.config.database.url });
                try {
                    await database.execute({
                        sql: `UPDATE plugin_management_requests
                              SET status = 'processing', resolved_by_user_id = ?,
                                  resolved_at = NULL, last_error = NULL
                              WHERE id = ?`,
                        args: [admin.id, pendingInstall.id],
                    });
                } finally {
                    database.close();
                }
            },
        });
        const recovered = (await client.get(`/v0/chats/${chatId}/pluginManagementRequests`)).json()
            .requests as Array<Record<string, string>>;
        expect(recovered.find(({ id }) => id === pendingInstall.id)).toMatchObject({
            action: "install",
            status: "failed",
            lastError: "The server stopped before the plugin operation completed.",
        });
    });
});

class PluginDeveloperRuntime implements PluginMcpRuntime {
    readonly nonContextualTokens: string[] = [];
    readonly contextualTokens: string[] = [];
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
            async close() {},
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
                    this.nonContextualTokens.push(token);
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
                    this.contextualTokens.push(token);
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
                        throw new Error(`Install request failed: ${JSON.stringify(body)}`);
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

async function hasSystemPlugin(client: GymRequestClient, shortName: string): Promise<boolean> {
    const systems = (await client.get("/v0/admin/systemPlugins")).json().plugins as Array<{
        shortName: string;
    }>;
    return systems.some((plugin) => plugin.shortName === shortName);
}

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
): Promise<void> {
    await waitFor(async () => {
        const messages = (await client.get(`/v0/chats/${chatId}/messages`)).json()
            .messages as unknown[];
        return messages.length >= count;
    }, `${count} chat messages`);
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 8_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
