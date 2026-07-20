import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    pluginCatalogLoad,
    PluginCatalog,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
    type WebhookTransport,
    type WebhookUrlPolicy,
} from "happy2-server";
import { createGymServer } from "happy2-gym";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("system plugin installation and MCP health", () => {
    const temporaryDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(
            temporaryDirectories
                .splice(0)
                .map((path) => rm(path, { force: true, recursive: true })),
        );
    });

    it("installs the bundled hello skill without plugin parameters", async () => {
        const runtime = new MockPluginMcpRuntime();
        await using server = await createGymServer({ pluginMcpRuntime: runtime });
        const admin = await server.createUser({ username: "hello_plugin_admin" });

        const catalog = await server.as(admin).get("/v0/admin/plugins");
        expect(catalog.statusCode).toBe(200);
        expect(catalog.json().plugins).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    shortName: "hello",
                    variables: [],
                    skills: [expect.objectContaining({ name: "hello" })],
                }),
            ]),
        );

        const first = await server.as(admin).post("/v0/admin/plugins/hello/installPlugin");
        const second = await server.as(admin).post("/v0/admin/plugins/hello/installPlugin");
        expect(first.statusCode).toBe(202);
        expect(second.statusCode).toBe(202);
        expect(first.json().installation).toMatchObject({
            shortName: "hello",
            status: "preparing",
        });
        expect(second.json().installation.pluginId).toBe(first.json().installation.pluginId);
        expect(second.json().installation.id).not.toBe(first.json().installation.id);
        await Promise.all([
            waitForStatus(server, admin, first.json().installation.id as string, "ready"),
            waitForStatus(server, admin, second.json().installation.id as string, "ready"),
        ]);
        expect(runtime.prepares).toHaveLength(2);
    });

    it("validates requirements, snapshots packages, runs stdio MCP over HTTP, reports broken configuration, and resumes after restart", async () => {
        const root = await temporaryDirectory();
        await writeStdioPlugin(root);
        await writeSelectedContainerPlugin(root);
        await writeRemotePlugin(root);
        await writeHealthyRemotePlugin(root);
        const catalog = await pluginCatalogLoad(root);
        const runtime = new MockPluginMcpRuntime();
        const remote = new MockRemoteMcp();
        await using server = await createGymServer({
            pluginCatalog: catalog,
            pluginMcpRuntime: runtime,
            webhookTransport: remote.transport,
            webhookUrlPolicy: remote.urlPolicy,
        });
        const admin = await server.createUser({ username: "plugin_admin" });
        const member = await server.createUser({ username: "plugin_member" });

        expect((await server.get("/v0/admin/plugins")).statusCode).toBe(401);
        expect((await server.as(member).get("/v0/admin/plugins")).statusCode).toBe(403);
        expect((await server.get("/v0/admin/systemPlugins")).statusCode).toBe(401);
        expect((await server.as(member).get("/v0/admin/systemPlugins")).statusCode).toBe(403);
        const initial = await server.as(admin).get("/v0/admin/plugins");
        expect(initial.statusCode).toBe(200);
        const invalidPath = await server.as(admin).get("/v0/admin/plugins/INVALID/icon");
        expect(invalidPath.statusCode).toBe(400);
        expect(invalidPath.json()).toMatchObject({ error: "invalid_request" });
        const unexpectedField = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: {},
                unexpected: true,
            });
        expect(unexpectedField.statusCode).toBe(400);
        expect(unexpectedField.json()).toMatchObject({ error: "invalid_request" });
        expect(initial.json().plugins).toEqual([
            expect.objectContaining({
                shortName: "remote-broken",
                version: "1.0.0",
                mcp: { type: "remote", container: "none" },
            }),
            expect.objectContaining({
                shortName: "remote-ready",
                version: "1.0.0",
                mcp: { type: "remote", container: "none" },
            }),
            expect.objectContaining({
                shortName: "selected-tools",
                version: "1.0.0",
                mcp: { type: "stdio", container: "selection_required" },
            }),
            expect.objectContaining({
                shortName: "stdio-tools",
                version: "1.2.3",
                mcp: { type: "stdio", container: "bundled" },
                skills: [
                    expect.objectContaining({
                        name: "project-search",
                        directory: "skills/project-search",
                    }),
                ],
            }),
        ]);
        expect(JSON.stringify(initial.json())).not.toContain("stdio-secret-value");
        const icon = await server.as(admin).get("/v0/admin/plugins/stdio-tools/icon");
        expect(icon.statusCode).toBe(200);
        expect(icon.headers["content-type"]).toContain("image/png");

        const memberInstall = await server
            .as(member)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "unauthorized", DISPLAY_MODE: "compact" },
            });
        expect(memberInstall.statusCode).toBe(403);
        expect(runtime.prepares).toHaveLength(0);

        const missing = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", { variables: {} });
        expect(missing.statusCode).toBe(400);
        expect(missing.json()).toMatchObject({ error: "broken_configuration" });

        const syncState = (await server.as(admin).get("/v0/sync/state")).json().state;
        const installed = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "stdio-secret-value", DISPLAY_MODE: "compact" },
            });
        expect(installed.statusCode).toBe(202);
        expect(installed.json().installation).toMatchObject({
            id: expect.stringMatching(/^[a-z][a-z0-9]{23}$/),
            pluginId: expect.stringMatching(/^[a-z][a-z0-9]{23}$/),
            shortName: "stdio-tools",
            sourceVersion: "1.2.3",
            status: "preparing",
        });
        const stdioInstallationId = installed.json().installation.id as string;
        const stdioPluginId = installed.json().installation.pluginId as string;
        await waitForStatus(server, admin, stdioInstallationId, "ready");
        const difference = await server.as(admin).post("/v0/sync/getDifference", {
            state: syncState,
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().areas).toContain("plugins");
        expect(runtime.prepares).toHaveLength(1);
        expect(runtime.prepares[0]).toMatchObject({
            build: {
                dockerfile: "FROM alpine:3.21\n",
                tag: expect.stringMatching(/^happy2-plugin:/),
            },
            imageTag: expect.stringMatching(/^happy2-plugin:/),
        });
        expect(runtime.opens.at(-1)?.environment).toMatchObject({
            STDIO_TOKEN: "stdio-secret-value",
            DISPLAY_MODE: "compact",
        });
        const duplicate = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "another-secret", DISPLAY_MODE: "expanded" },
            });
        expect(duplicate.statusCode).toBe(202);
        expect(duplicate.json().installation).toMatchObject({
            pluginId: stdioPluginId,
            shortName: "stdio-tools",
            status: "preparing",
        });
        const secondStdioInstallationId = duplicate.json().installation.id as string;
        expect(secondStdioInstallationId).not.toBe(stdioInstallationId);
        await waitForStatus(server, admin, secondStdioInstallationId, "ready");
        expect(
            runtime.opens.find(({ environment }) => environment.STDIO_TOKEN === "another-secret")
                ?.environment,
        ).toMatchObject({ STDIO_TOKEN: "another-secret", DISPLAY_MODE: "expanded" });
        expect(
            new Set(
                runtime.prepares
                    .filter(({ installationId }) =>
                        [stdioInstallationId, secondStdioInstallationId].includes(installationId),
                    )
                    .map(({ containerName }) => containerName),
            ).size,
        ).toBe(2);
        const selectedMissingContainer = await server
            .as(admin)
            .post("/v0/admin/plugins/selected-tools/installPlugin", { variables: {} });
        expect(selectedMissingContainer.statusCode).toBe(400);
        expect(selectedMissingContainer.json()).toMatchObject({
            error: "broken_configuration",
        });
        const selected = await server
            .as(admin)
            .post("/v0/admin/plugins/selected-tools/installPlugin", {
                variables: {},
                containerImageId: "happy2-gym-setup-ready-image",
            });
        expect(selected.statusCode).toBe(202);
        await waitForStatus(server, admin, selected.json().installation.id as string, "ready");
        expect(
            runtime.prepares.find(
                ({ installationId }) =>
                    installationId === (selected.json().installation.id as string),
            ),
        ).toMatchObject({ imageTag: "happy2-gym:setup-ready" });
        const remoteInstalled = await server
            .as(admin)
            .post("/v0/admin/plugins/remote-ready/installPlugin", {
                variables: { REMOTE_TOKEN: "remote-secret-value" },
            });
        expect(remoteInstalled.statusCode).toBe(202);
        await waitForStatus(
            server,
            admin,
            remoteInstalled.json().installation.id as string,
            "ready",
        );
        expect(remote.requests.length).toBeGreaterThanOrEqual(3);
        expect(remote.requests[0]?.headers.authorization).toBe("Bearer remote-secret-value");
        const healthyRemoteRequestCount = remote.requests.length;
        const listed = await server.as(admin).get("/v0/admin/plugins");
        expect(JSON.stringify(listed.json())).not.toContain("stdio-secret-value");
        expect(JSON.stringify(listed.json())).not.toContain("remote-secret-value");
        const listedStdio = listed
            .json()
            .plugins.find((plugin: { shortName: string }) => plugin.shortName === "stdio-tools");
        expect(listedStdio.systemPlugin).toMatchObject({
            id: stdioPluginId,
            sourceVersion: "1.2.3",
            image: {
                contentType: "image/png",
                size: SQUARE_PNG.byteLength,
                width: 1,
                height: 1,
                thumbhash: expect.any(String),
                checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
                url: `/v0/admin/systemPlugins/${stdioPluginId}/image`,
            },
            installations: expect.arrayContaining([
                expect.objectContaining({ id: stdioInstallationId }),
                expect.objectContaining({ id: secondStdioInstallationId }),
            ]),
        });
        const systemPlugins = await server.as(admin).get("/v0/admin/systemPlugins");
        expect(systemPlugins.statusCode).toBe(200);
        expect(systemPlugins.json().plugins).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: stdioPluginId,
                    shortName: "stdio-tools",
                    installations: expect.arrayContaining([
                        expect.objectContaining({ id: stdioInstallationId }),
                        expect.objectContaining({ id: secondStdioInstallationId }),
                    ]),
                }),
            ]),
        );
        const persistedImage = await server
            .as(admin)
            .get(`/v0/admin/systemPlugins/${stdioPluginId}/image`);
        expect(persistedImage.statusCode).toBe(200);
        expect(persistedImage.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
        expect(persistedImage.rawPayload).toEqual(SQUARE_PNG);
        expect(
            (await server.get(`/v0/admin/systemPlugins/${stdioPluginId}/image`)).statusCode,
        ).toBe(401);
        expect(
            (await server.as(member).get(`/v0/admin/systemPlugins/${stdioPluginId}/image`))
                .statusCode,
        ).toBe(403);
        await rm(join(root, "stdio-tools", "plugin.png"));

        const serverUrl = await server.listen();
        expect((await initializeMcp(serverUrl, undefined, stdioInstallationId, 0)).statusCode).toBe(
            401,
        );
        const initialize = await initializeMcp(serverUrl, member, stdioInstallationId, 1);
        expect(initialize.statusCode).toBe(200);
        expect(mcpJson(initialize.body)).toMatchObject({
            jsonrpc: "2.0",
            id: 1,
            result: { serverInfo: { name: "gym-plugin", version: "1.0.0" } },
        });
        const sessionId = initialize.headers["mcp-session-id"];
        expect(sessionId).toEqual(expect.any(String));
        const tools = await mcpRequest(
            serverUrl,
            member,
            stdioInstallationId,
            { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
            sessionId,
        );
        expect(tools.statusCode).toBe(200);
        expect(mcpJson(tools.body)).toMatchObject({
            id: 2,
            result: { tools: [{ name: "gym_echo" }] },
        });
        const hijack = await mcpRequest(
            serverUrl,
            admin,
            stdioInstallationId,
            { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
            sessionId,
        );
        expect(hijack.statusCode).toBe(404);
        const installedImageTag = runtime.prepares.find(
            ({ installationId }) => installationId === stdioInstallationId,
        )!.imageTag;
        const upgradedCatalogPackage = catalog.get("stdio-tools")!;
        upgradedCatalogPackage.manifest.version = "1.3.0";
        upgradedCatalogPackage.packageDigest = `sha256:${"f".repeat(64)}`;
        const upgradeAvailable = await server.as(admin).get("/v0/admin/plugins");
        const upgradeItem = upgradeAvailable
            .json()
            .plugins.find((plugin: { shortName: string }) => plugin.shortName === "stdio-tools");
        expect(upgradeItem).toMatchObject({
            version: "1.3.0",
            systemPlugin: {
                sourceVersion: "1.2.3",
                updateAvailable: true,
                installations: expect.arrayContaining([
                    expect.objectContaining({ id: stdioInstallationId }),
                    expect.objectContaining({ id: secondStdioInstallationId }),
                ]),
            },
        });
        upgradedCatalogPackage.manifest.mcp = undefined;
        const pinnedRequirements = await server.as(admin).get("/v0/admin/plugins");
        expect(
            pinnedRequirements
                .json()
                .plugins.find(
                    (plugin: { shortName: string }) => plugin.shortName === "stdio-tools",
                ),
        ).toMatchObject({
            version: "1.3.0",
            variables: [
                expect.objectContaining({ key: "STDIO_TOKEN" }),
                expect.objectContaining({ key: "DISPLAY_MODE" }),
            ],
            mcp: { type: "stdio", container: "bundled" },
            systemPlugin: { sourceVersion: "1.2.3", updateAvailable: true },
        });
        const installedBeforeUpgrade = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: {
                    STDIO_TOKEN: "persisted-manifest-secret",
                    DISPLAY_MODE: "persisted",
                },
            });
        expect(installedBeforeUpgrade.statusCode).toBe(202);
        expect(installedBeforeUpgrade.json().installation).toMatchObject({
            pluginId: stdioPluginId,
            status: "preparing",
        });
        await waitForStatus(
            server,
            admin,
            installedBeforeUpgrade.json().installation.id as string,
            "ready",
        );

        const broken = await server
            .as(admin)
            .post("/v0/admin/plugins/remote-broken/installPlugin", {
                variables: { REMOTE_TOKEN: "not\na\nheader" },
            });
        expect(broken.statusCode).toBe(202);
        await waitForStatus(
            server,
            admin,
            broken.json().installation.id as string,
            "broken_configuration",
        );
        expect(remote.requests).toHaveLength(healthyRemoteRequestCount);

        const preparesBeforeRestart = runtime.prepares.length;
        await server.restart();
        await waitForStatus(server, admin, stdioInstallationId, "ready");
        await waitForStatus(server, admin, secondStdioInstallationId, "ready");
        expect(runtime.prepares.length).toBeGreaterThan(preparesBeforeRestart);
        expect(
            runtime.prepares
                .filter(({ installationId }) => installationId === stdioInstallationId)
                .at(-1)?.imageTag,
        ).toBe(installedImageTag);
        const afterRestart = await server.as(admin).get("/v0/admin/plugins");
        const stdio = afterRestart
            .json()
            .plugins.find((plugin: { shortName: string }) => plugin.shortName === "stdio-tools");
        expect(stdio.systemPlugin).toMatchObject({
            sourceVersion: "1.2.3",
            updateAvailable: true,
            installations: expect.arrayContaining([
                expect.objectContaining({ id: stdioInstallationId, status: "ready" }),
                expect.objectContaining({ id: secondStdioInstallationId, status: "ready" }),
            ]),
        });
        expect(
            (await server.as(admin).get(`/v0/admin/systemPlugins/${stdioPluginId}/image`))
                .rawPayload,
        ).toEqual(SQUARE_PNG);
    }, 30_000);

    it("preserves failed runtime diagnostics and retries one installation explicitly", async () => {
        const root = await temporaryDirectory();
        await writeStdioPlugin(root);
        const runtime = new MockPluginMcpRuntime();
        runtime.failOpen = true;
        await using server = await createGymServer({
            pluginCatalog: await pluginCatalogLoad(root),
            pluginMcpRuntime: runtime,
        });
        const admin = await server.createUser({ username: "plugin_recovery_admin" });
        const installed = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "recovery-secret", DISPLAY_MODE: "compact" },
            });
        expect(installed.statusCode).toBe(202);
        await waitForStatus(server, admin, installed.json().installation.id as string, "failed");
        expect(runtime.prepares).toHaveLength(1);
        expect(runtime.opens).toHaveLength(1);
        expect(runtime.removals).toContain(
            `happy2-plugin-${installed.json().installation.id as string}`,
        );
        const installationId = installed.json().installation.id as string;
        expect(
            (await server.get(`/v0/admin/pluginInstallations/${installationId}/diagnostics`))
                .statusCode,
        ).toBe(401);
        const diagnostics = await server
            .as(admin)
            .get(`/v0/admin/pluginInstallations/${installationId}/diagnostics`);
        expect(diagnostics.statusCode).toBe(200);
        expect(diagnostics.json().diagnostics).toMatchObject({
            installationId,
            status: "failed",
            error: "Mock MCP process did not start",
            output: expect.stringContaining("native module failed to load"),
        });
        expect(JSON.stringify(diagnostics.json())).not.toContain("recovery-secret");
        expect(diagnostics.json().diagnostics.output).toContain("[REDACTED]");

        runtime.failOpen = false;
        const retried = await server
            .as(admin)
            .post(`/v0/admin/pluginInstallations/${installationId}/retryPlugin`);
        expect(retried.statusCode).toBe(202);
        expect(retried.json().installation).toMatchObject({
            id: installationId,
            status: "preparing",
        });
        await waitForStatus(server, admin, installationId, "ready");
        expect(
            (
                await server
                    .as(admin)
                    .get(`/v0/admin/pluginInstallations/${installationId}/diagnostics`)
            ).json().diagnostics,
        ).toMatchObject({ installationId, status: "ready" });
        expect(
            (
                await server
                    .as(admin)
                    .get(`/v0/admin/pluginInstallations/${installationId}/diagnostics`)
            ).json().diagnostics.output,
        ).toBeUndefined();

        runtime.failOpen = true;
        const removalsBeforeAdoptionFailure = runtime.removals.length;
        await server.restart();
        await waitForStatus(server, admin, installationId, "failed");
        expect(runtime.removals.slice(removalsBeforeAdoptionFailure)).toContain(
            `happy2-plugin-${installationId}`,
        );
    }, 30_000);

    it("creates one system plugin for concurrent installations with independent parameters and containers", async () => {
        const root = await temporaryDirectory();
        await writeStdioPlugin(root);
        const runtime = new MockPluginMcpRuntime();
        await using server = await createGymServer({
            pluginCatalog: await pluginCatalogLoad(root),
            pluginMcpRuntime: runtime,
        });
        const admin = await server.createUser({ username: "plugin_concurrent_admin" });

        const [compact, expanded] = await Promise.all([
            server.as(admin).post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "compact-secret", DISPLAY_MODE: "compact" },
            }),
            server.as(admin).post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "expanded-secret", DISPLAY_MODE: "expanded" },
            }),
        ]);
        expect(compact.statusCode).toBe(202);
        expect(expanded.statusCode).toBe(202);
        const compactInstallation = compact.json().installation as {
            id: string;
            pluginId: string;
        };
        const expandedInstallation = expanded.json().installation as {
            id: string;
            pluginId: string;
        };
        expect(expandedInstallation.pluginId).toBe(compactInstallation.pluginId);
        expect(expandedInstallation.id).not.toBe(compactInstallation.id);
        await Promise.all([
            waitForStatus(server, admin, compactInstallation.id, "ready"),
            waitForStatus(server, admin, expandedInstallation.id, "ready"),
        ]);
        expect(
            runtime.prepares
                .filter(({ installationId }) =>
                    [compactInstallation.id, expandedInstallation.id].includes(installationId),
                )
                .map(({ containerName }) => containerName),
        ).toEqual(
            expect.arrayContaining([
                `happy2-plugin-${compactInstallation.id}`,
                `happy2-plugin-${expandedInstallation.id}`,
            ]),
        );
        expect(runtime.opens.map(({ environment }) => environment)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    STDIO_TOKEN: "compact-secret",
                    DISPLAY_MODE: "compact",
                }),
                expect.objectContaining({
                    STDIO_TOKEN: "expanded-secret",
                    DISPLAY_MODE: "expanded",
                }),
            ]),
        );
    }, 30_000);

    it("prunes an installed built-in plugin when its bundle is absent on restart", async () => {
        const root = await temporaryDirectory();
        await writeStdioPlugin(root);
        const runtime = new MockPluginMcpRuntime();
        await using server = await createGymServer({
            pluginCatalog: await pluginCatalogLoad(root),
            pluginMcpRuntime: runtime,
        });
        const admin = await server.createUser({ username: "plugin_prune_admin" });
        const installed = await server
            .as(admin)
            .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                variables: { STDIO_TOKEN: "prune-secret", DISPLAY_MODE: "compact" },
            });
        expect(installed.statusCode).toBe(202);
        const installationId = installed.json().installation.id as string;
        const pluginId = installed.json().installation.pluginId as string;
        await waitForStatus(server, admin, installationId, "ready");
        const packageDirectory = join(server.config.plugins.directory, pluginId);
        await expect(access(packageDirectory)).resolves.toBeUndefined();
        const state = (await server.as(admin).get("/v0/sync/state")).json().state;

        await server.restart({ pluginCatalog: new PluginCatalog([]) });

        const systemPlugins = await server.as(admin).get("/v0/admin/systemPlugins");
        expect(systemPlugins.statusCode).toBe(200);
        expect(systemPlugins.json().plugins).toEqual([]);
        await expect(access(packageDirectory)).rejects.toMatchObject({ code: "ENOENT" });
        expect(
            runtime.removals.filter(
                (containerName) => containerName === `happy2-plugin-${installationId}`,
            ).length,
        ).toBe(1);
        const difference = await server.as(admin).post("/v0/sync/getDifference", { state });
        expect(difference.json().areas).toContain("plugins");
    }, 30_000);

    it("aborts in-flight container preparation during server shutdown", async () => {
        const root = await temporaryDirectory();
        await writeStdioPlugin(root);
        const runtime = new BlockingPluginMcpRuntime();
        const server = await createGymServer({
            pluginCatalog: await pluginCatalogLoad(root),
            pluginMcpRuntime: runtime,
        });
        try {
            const admin = await server.createUser({ username: "plugin_shutdown_admin" });
            const installed = await server
                .as(admin)
                .post("/v0/admin/plugins/stdio-tools/installPlugin", {
                    variables: { STDIO_TOKEN: "shutdown-secret", DISPLAY_MODE: "compact" },
                });
            expect(installed.statusCode).toBe(202);
            await runtime.started;

            await server.close();

            expect(runtime.aborted).toBe(true);
        } finally {
            await server.close();
        }
    }, 30_000);

    async function temporaryDirectory(): Promise<string> {
        const path = await mkdtemp(join(tmpdir(), "happy2-plugin-catalog-"));
        temporaryDirectories.push(path);
        return path;
    }
});

class MockPluginMcpRuntime implements PluginMcpRuntime {
    readonly prepares: PluginLocalPrepareInput[] = [];
    readonly opens: PluginLocalOpenInput[] = [];
    readonly removals: string[] = [];
    failOpen = false;

    async startLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async monitorLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async prepareLocal(input: PluginLocalPrepareInput) {
        this.prepares.push(structuredClone(input));
        return {
            containerInstanceId: input.existingContainerInstanceId ?? input.containerInstanceId,
            imageTag: input.imageTag,
            reused: input.existingContainerInstanceId !== undefined,
        };
    }

    async openLocal(
        input: PluginLocalOpenInput,
        _signal?: AbortSignal,
        onStderr?: (chunk: string) => void,
    ) {
        this.opens.push(structuredClone(input));
        if (this.failOpen) {
            const secret = input.environment.STDIO_TOKEN;
            const split = Math.max(1, Math.floor(secret.length / 2));
            onStderr?.(`Error: native module failed to load token=${secret.slice(0, split)}`);
            onStderr?.(`${secret.slice(split)}\n    at plugin/server.js:42\n`);
            throw new Error("Mock MCP process did not start");
        }
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
                              serverInfo: { name: "gym-plugin", version: "1.0.0" },
                          }
                        : message.method === "tools/list"
                          ? {
                                tools: [
                                    {
                                        name: "gym_echo",
                                        description: "Echoes Gym input",
                                        inputSchema: { type: "object" },
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
        this.removals.push(containerName);
    }
}

class MockRemoteMcp {
    readonly requests: Parameters<WebhookTransport["deliver"]>[0][] = [];
    readonly urlPolicy: WebhookUrlPolicy = {
        validateForStorage: (url) => url,
        resolveForDelivery: async (url) => ({
            url,
            addresses: [{ address: "203.0.113.10", family: 4 }],
        }),
    };
    readonly transport: WebhookTransport = {
        deliver: async (request) => {
            this.requests.push(structuredClone(request));
            if (request.method === "DELETE") return { statusCode: 405 };
            const message = JSON.parse(request.body) as { id?: string; method?: string };
            if (message.id === undefined) return { statusCode: 202 };
            const result =
                message.method === "initialize"
                    ? {
                          protocolVersion: "2025-06-18",
                          capabilities: { tools: {} },
                          serverInfo: { name: "remote-gym", version: "1.0.0" },
                      }
                    : message.method === "tools/list"
                      ? {
                            tools: [
                                {
                                    name: "remote_echo",
                                    description: "Remote echo tool",
                                    inputSchema: { type: "object" },
                                },
                            ],
                        }
                      : {};
            return {
                statusCode: 200,
                body: JSON.stringify({ jsonrpc: "2.0", id: message.id, result }),
                ...(message.method === "initialize"
                    ? { headers: { "mcp-session-id": "remote-gym-session" } }
                    : {}),
            };
        },
    };
}

class BlockingPluginMcpRuntime implements PluginMcpRuntime {
    aborted = false;
    readonly started: Promise<void>;
    private markStarted!: () => void;

    constructor() {
        this.started = new Promise((resolve) => {
            this.markStarted = resolve;
        });
    }

    prepareLocal(
        _input: PluginLocalPrepareInput,
        signal?: AbortSignal,
    ): Promise<{ containerInstanceId: string; imageTag: string; reused: boolean }> {
        this.markStarted();
        return new Promise((_resolve, reject) => {
            const abort = () => {
                this.aborted = true;
                const error = new Error("Mock container build aborted");
                error.name = "AbortError";
                reject(error);
            };
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
        });
    }

    async openLocal(): Promise<never> {
        throw new Error("Blocked preparation must not open MCP");
    }

    async startLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async monitorLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async removeLocal(): Promise<void> {}
}

async function initializeMcp(
    serverUrl: string,
    actor: { token: string } | undefined,
    installationId: string,
    id: number,
) {
    return mcpRequest(serverUrl, actor, installationId, {
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "gym", version: "1.0.0" },
        },
    });
}

async function mcpRequest(
    serverUrl: string,
    actor: { token: string } | undefined,
    installationId: string,
    body: Record<string, unknown>,
    sessionId?: string,
): Promise<{ body: string; headers: Record<string, string>; statusCode: number }> {
    const response = await fetch(`${serverUrl}/v0/pluginInstallations/${installationId}/mcp`, {
        method: "POST",
        headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
            ...(sessionId
                ? {
                      "mcp-session-id": sessionId,
                      "mcp-protocol-version": "2025-06-18",
                  }
                : {}),
        },
        body: JSON.stringify(body),
    });
    return {
        statusCode: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
    };
}

async function writeStdioPlugin(root: string): Promise<void> {
    const directory = join(root, "stdio-tools");
    await mkdir(join(directory, "skills", "project-search"), { recursive: true });
    await mkdir(join(directory, "container"), { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(join(directory, "container", "Dockerfile"), "FROM alpine:3.21\n");
    await writeFile(
        join(directory, "skills", "project-search", "SKILL.md"),
        "---\nname: project-search\ndescription: Search a project through the bundled MCP tools.\n---\n\nUse the project tools.\n",
    );
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.2.3",
            displayName: "Stdio Tools",
            shortName: "stdio-tools",
            description: "Containerized tools for Gym.",
            variables: [
                {
                    key: "STDIO_TOKEN",
                    displayName: "Token",
                    description: "Secret token used by the MCP server.",
                    kind: "secret",
                },
                {
                    key: "DISPLAY_MODE",
                    displayName: "Display mode",
                    description: "Plain runtime setting.",
                    kind: "text",
                },
            ],
            mcp: {
                type: "stdio",
                command: "/plugin/server",
                args: ["--stdio"],
                container: { dockerfile: "container/Dockerfile" },
            },
        }),
    );
}

async function writeRemotePlugin(root: string): Promise<void> {
    const directory = join(root, "remote-broken");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Remote Broken",
            shortName: "remote-broken",
            description: "Exercises configuration health.",
            variables: [
                {
                    key: "REMOTE_TOKEN",
                    displayName: "Remote token",
                    description: "Token placed in the remote request header.",
                    kind: "secret",
                },
            ],
            mcp: {
                type: "remote",
                url: "https://mcp.example.com/service",
                headers: { authorization: "Bearer ${REMOTE_TOKEN}" },
            },
        }),
    );
}

async function writeSelectedContainerPlugin(root: string): Promise<void> {
    const directory = join(root, "selected-tools");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Selected Tools",
            shortName: "selected-tools",
            description: "Runs in an administrator-selected ready image.",
            variables: [],
            mcp: { type: "stdio", command: "/plugin/server", args: ["--stdio"] },
        }),
    );
}

async function writeHealthyRemotePlugin(root: string): Promise<void> {
    const directory = join(root, "remote-ready");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Remote Ready",
            shortName: "remote-ready",
            description: "Exercises healthy remote MCP initialization.",
            variables: [
                {
                    key: "REMOTE_TOKEN",
                    displayName: "Remote token",
                    description: "Token placed in the remote request header.",
                    kind: "secret",
                },
            ],
            mcp: {
                type: "remote",
                url: "https://mcp.example.com/service",
                headers: { authorization: "Bearer ${REMOTE_TOKEN}" },
            },
        }),
    );
}

async function waitForStatus(
    server: Awaited<ReturnType<typeof createGymServer>>,
    admin: Parameters<typeof server.as>[0],
    installationId: string,
    status: string,
): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const response = await server.as(admin).get("/v0/admin/plugins");
        const installation = response
            .json()
            .plugins.flatMap(
                (candidate: { systemPlugin?: { installations?: unknown[] } }) =>
                    candidate.systemPlugin?.installations ?? [],
            )
            .find((candidate: { id: string }) => candidate.id === installationId);
        if (installation?.status === status) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Plugin installation ${installationId} did not reach ${status}`);
}

function mcpJson(body: string): Record<string, unknown> {
    const data = body
        .split(/\r?\n/)
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
    return JSON.parse(data ?? body) as Record<string, unknown>;
}
