import { describe, expect, it } from "vitest";
import {
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

describe("plugin-managed agent environments", () => {
    it("builds, deactivates, and reactivates environments while reprovisioning chat containers", async () => {
        await using rig = await createMockRigDaemon();
        const agents = new OrderedAgentSandboxRuntime();
        const plugins = new EnvironmentPluginRuntime();
        await using server = await createGymServer({
            agentSandbox: agents,
            databaseMode: "file",
            pluginMcpRuntime: plugins,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const admin = await server.createUser({ username: "environment_plugin_admin" });
        const asAdmin = server.as(admin);
        const catalog = await asAdmin.get("/v0/admin/plugins");
        expect(catalog.statusCode).toBe(200);
        expect(
            catalog
                .json()
                .plugins.find(
                    (plugin: { shortName: string }) =>
                        plugin.shortName === "environment-management",
                ),
        ).toMatchObject({
            skills: [{ name: "happy2-environment-management" }],
            apiPermissions: [
                {
                    id: "environments",
                    readOnly: [{ id: "environments:read" }],
                    mutations: [{ id: "environments:manage" }, { id: "environments:deactivate" }],
                },
            ],
        });

        const installed = await asAdmin.post(
            "/v0/admin/plugins/environment-management/installPlugin",
            {
                permissions: [
                    "environments:read",
                    "environments:manage",
                    "environments:deactivate",
                ],
            },
        );
        expect(installed.statusCode).toBe(202);
        const installationId = installed.json().installation.id as string;
        await waitForPlugin(asAdmin, installationId, "ready");
        const token = plugins.tokenFor(installationId);
        const restricted = await asAdmin.post(
            "/v0/admin/plugins/environment-management/installPlugin",
            { permissions: ["environments:read", "environments:manage"] },
        );
        expect(restricted.statusCode).toBe(202);
        const restrictedInstallationId = restricted.json().installation.id as string;
        await waitForPlugin(asAdmin, restrictedInstallationId, "ready");
        const restrictedToken = plugins.tokenFor(restrictedInstallationId);
        const host = server.pluginHost();
        const authorized = { headers: { authorization: `Bearer ${token}` } };
        const restrictedAuthorization = {
            headers: { authorization: `Bearer ${restrictedToken}` },
        };

        const initial = await host.get("/environments", authorized);
        expect(initial.statusCode).toBe(200);
        expect(initial.json()).toMatchObject({
            defaultEnvironmentId: "happy2-gym-setup-ready-image",
            environments: expect.arrayContaining([
                {
                    id: "happy2-gym-setup-ready-image",
                    name: "Gym setup image",
                    status: "ready",
                    builtin: false,
                    active: true,
                },
                expect.objectContaining({ builtin: true }),
            ]),
        });
        expect((await host.get("/environments")).statusCode).toBe(403);
        expect(
            (
                await host.post(
                    "/environments/happy2-gym-setup-ready-image/deactivateEnvironment",
                    {},
                    restrictedAuthorization,
                )
            ).statusCode,
        ).toBe(403);

        agents.pauseBuilds();
        const building = await host.post(
            "/environments/createEnvironment",
            {
                name: "Build guard",
                dockerfile: "FROM ubuntu:24.04\nRUN echo build-guard\n",
            },
            authorized,
        );
        expect(building.statusCode).toBe(202);
        const buildingEnvironmentId = building.json().environment.id as string;
        await waitForEnvironment(host, authorized, buildingEnvironmentId, "building");
        const buildingDeactivation = await host.post(
            `/environments/${buildingEnvironmentId}/deactivateEnvironment`,
            {},
            authorized,
        );
        expect(buildingDeactivation.statusCode).toBe(409);
        expect(buildingDeactivation.json().message).toContain("build");
        agents.resumeBuilds();
        await waitForEnvironment(host, authorized, buildingEnvironmentId, "ready");

        const dockerfile = "FROM ubuntu:24.04\nRUN echo plugin-environment\n";
        const created = await host.post(
            "/environments/createEnvironment",
            { name: "Plugin tools", dockerfile },
            authorized,
        );
        expect(created.statusCode).toBe(202);
        expect(created.json().environment).toMatchObject({
            id: expect.stringMatching(/^[a-z][a-z0-9]{23}$/),
            name: "Plugin tools",
            builtin: false,
            active: true,
        });
        const environmentId = created.json().environment.id as string;
        await waitForEnvironment(host, authorized, environmentId, "ready");
        expect(agents.buildRequests.at(-1)?.dockerfile).toBe(dockerfile);
        const details = await host.get(`/environments/${environmentId}/dockerfile`, authorized);
        expect(details.statusCode).toBe(200);
        expect(details.json()).toEqual({
            environment: {
                id: environmentId,
                name: "Plugin tools",
                dockerfile,
                active: true,
            },
        });

        const selected = await host.post(
            `/environments/${environmentId}/setDefaultEnvironment`,
            {},
            authorized,
        );
        expect(selected.statusCode).toBe(200);
        expect(selected.json()).toMatchObject({
            defaultEnvironmentId: environmentId,
            environment: { id: environmentId, status: "ready" },
        });
        const defaultDeactivation = await host.post(
            `/environments/${environmentId}/deactivateEnvironment`,
            {},
            authorized,
        );
        expect(defaultDeactivation.statusCode).toBe(409);
        expect(defaultDeactivation.json().message).toContain("in use");

        const createdAgent = await asAdmin.post("/v0/chats/createAgent", {
            name: "Environment User",
            username: "environment_user",
        });
        expect(createdAgent.statusCode).toBe(201);
        const agent = (
            (await asAdmin.get("/v0/contacts")).json().users as Array<{
                agentImageId?: string;
                id: string;
                username: string;
            }>
        ).find(({ username }) => username === "environment_user");
        if (!agent) throw new Error("Created agent was not listed");
        expect(agent.agentImageId).toBe(environmentId);
        const oldContainer = agents.createdContainers.at(-1)!;
        expect(oldContainer.imageId).toBe(environmentId);

        const originalEnvironmentId = "happy2-gym-setup-ready-image";
        expect(
            (
                await host.post(
                    `/environments/${originalEnvironmentId}/setDefaultEnvironment`,
                    {},
                    authorized,
                )
            ).statusCode,
        ).toBe(200);
        const assignedDeactivation = await host.post(
            `/environments/${environmentId}/deactivateEnvironment`,
            {},
            authorized,
        );
        expect(assignedDeactivation.statusCode).toBe(409);
        expect(assignedDeactivation.json().message).toContain("in use");

        const changed = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: originalEnvironmentId,
        });
        expect(changed.statusCode).toBe(200);
        expect(changed.json().user).toMatchObject({
            id: agent.id,
            agentImageId: originalEnvironmentId,
        });
        const replacement = agents.createdContainers.at(-1)!;
        expect(replacement).toMatchObject({
            agentUserId: agent.id,
            imageId: originalEnvironmentId,
            workspaceDirectory: oldContainer.workspaceDirectory,
            homeDirectory: oldContainer.homeDirectory,
        });
        expect(replacement.containerName).not.toBe(oldContainer.containerName);
        expect(rig.createdSessions.at(-1)).toMatchObject({
            cwd: oldContainer.workspaceDirectory,
            docker: { container: replacement.containerName },
        });
        expect(agents.removedContainers).toContain(oldContainer.containerName);
        expect(agents.lifecycle.indexOf(`create:${replacement.containerName}`)).toBeLessThan(
            agents.lifecycle.indexOf(`remove:${oldContainer.containerName}`),
        );

        const buildRequestCount = agents.buildRequests.length;
        const deactivated = await host.post(
            `/environments/${environmentId}/deactivateEnvironment`,
            {},
            authorized,
        );
        expect(deactivated.statusCode).toBe(200);
        expect(deactivated.json()).toEqual({ deactivated: true, environmentId });
        const retained = await host.get(`/environments/${environmentId}/dockerfile`, authorized);
        expect(retained.statusCode).toBe(200);
        expect(retained.json()).toEqual({
            environment: {
                id: environmentId,
                name: "Plugin tools",
                dockerfile,
                active: false,
            },
        });
        expect((await host.get("/environments", authorized)).json().environments).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: environmentId, active: false })]),
        );
        const repeatedDeactivation = await host.post(
            `/environments/${environmentId}/deactivateEnvironment`,
            {},
            authorized,
        );
        expect(repeatedDeactivation.statusCode).toBe(409);
        expect(repeatedDeactivation.json().message).toContain("already deactivated");
        expect(
            (
                await host.post(
                    `/environments/${environmentId}/setDefaultEnvironment`,
                    {},
                    authorized,
                )
            ).statusCode,
        ).toBe(404);

        const reactivated = await host.post(
            "/environments/createEnvironment",
            { name: "Plugin tools rebuilt", dockerfile },
            authorized,
        );
        expect(reactivated.statusCode).toBe(202);
        expect(reactivated.json().environment).toMatchObject({
            id: environmentId,
            name: "Plugin tools rebuilt",
            status: "pending",
            active: true,
        });
        await waitForEnvironment(host, authorized, environmentId, "ready");
        expect((await host.get("/environments", authorized)).json().environments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: environmentId,
                    name: "Plugin tools rebuilt",
                    status: "ready",
                    active: true,
                }),
            ]),
        );
        expect(agents.buildRequests).toHaveLength(buildRequestCount + 1);
        expect(agents.buildRequests.at(-1)?.dockerfile).toBe(dockerfile);

        const builtinId = initial
            .json()
            .environments.find((environment: { builtin: boolean }) => environment.builtin)
            .id as string;
        const builtinDeactivation = await host.post(
            `/environments/${builtinId}/deactivateEnvironment`,
            {},
            authorized,
        );
        expect(builtinDeactivation.statusCode).toBe(409);
        expect(builtinDeactivation.json().message).toContain("Built-in");
    }, 20_000);
});

class OrderedAgentSandboxRuntime extends MockAgentSandboxRuntime {
    readonly lifecycle: string[] = [];

    override async createSandbox(
        input: Parameters<MockAgentSandboxRuntime["createSandbox"]>[0],
        signal?: Parameters<MockAgentSandboxRuntime["createSandbox"]>[1],
    ): Promise<void> {
        this.lifecycle.push(`create:${input.containerName}`);
        await super.createSandbox(input, signal);
    }

    override async removeSandbox(containerName: string): Promise<void> {
        this.lifecycle.push(`remove:${containerName}`);
        await super.removeSandbox(containerName);
    }
}

class EnvironmentPluginRuntime implements PluginMcpRuntime {
    readonly opens: PluginLocalOpenInput[] = [];
    private readonly containers = new Map<
        string,
        { installationId: string; containerInstanceId: string }
    >();

    async startLocalCommand(): Promise<never> {
        throw new Error("Environment Management does not declare a persistent command");
    }

    async monitorLocalCommand(): Promise<never> {
        throw new Error("Environment Management does not declare a persistent command");
    }

    async prepareLocal(input: PluginLocalPrepareInput) {
        const containerInstanceId = input.existingContainerInstanceId ?? input.containerInstanceId;
        this.containers.set(input.containerName, {
            installationId: input.installationId,
            containerInstanceId,
        });
        return {
            containerInstanceId,
            imageTag: input.imageTag,
            reused: input.existingContainerInstanceId !== undefined,
        };
    }

    async openLocal(input: PluginLocalOpenInput) {
        this.opens.push(structuredClone(input));
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            async send(message) {
                if (!("id" in message) || !("method" in message)) return;
                const result =
                    message.method === "initialize"
                        ? {
                              protocolVersion: "2025-06-18",
                              capabilities: { tools: {} },
                              serverInfo: {
                                  name: "environment-management-gym",
                                  version: "1.0.0",
                              },
                          }
                        : message.method === "tools/list"
                          ? {
                                tools: [
                                    {
                                        name: "happy2_environments_list",
                                        description: "Lists environments.",
                                        inputSchema: { type: "object", properties: {} },
                                    },
                                ],
                            }
                          : {};
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async removeLocal(containerName: string): Promise<void> {
        this.containers.delete(containerName);
    }

    async isLocalRunning(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean> {
        const state = this.containers.get(containerName);
        return (
            state?.installationId === installationId &&
            state.containerInstanceId === containerInstanceId
        );
    }

    tokenFor(installationId: string): string {
        const token = this.opens
            .filter(({ containerName }) => containerName.endsWith(installationId))
            .at(-1)?.environment.HAPPY2_PLUGIN_API_TOKEN;
        if (!token) throw new Error("Plugin runtime token was not issued");
        return token;
    }
}

async function waitForPlugin(
    client: GymRequestClient,
    installationId: string,
    status: string,
): Promise<void> {
    await waitFor(async () => {
        const response = await client.get("/v0/admin/plugins");
        const installation = response
            .json()
            .plugins.flatMap(
                (plugin: { systemPlugin?: { installations?: { id: string; status: string }[] } }) =>
                    plugin.systemPlugin?.installations ?? [],
            )
            .find((candidate: { id: string }) => candidate.id === installationId);
        return installation?.status === status;
    }, "plugin installation");
}

async function waitForEnvironment(
    client: GymRequestClient,
    options: Parameters<GymRequestClient["get"]>[1],
    environmentId: string,
    status: string,
): Promise<void> {
    await waitFor(async () => {
        const response = await client.get("/environments", options);
        return response
            .json()
            .environments.some(
                (environment: { id: string; status: string }) =>
                    environment.id === environmentId && environment.status === status,
            );
    }, "agent environment");
}

async function waitFor(
    condition: () => boolean | Promise<boolean>,
    description: string,
): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!(await condition())) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
