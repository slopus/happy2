import { createServer, request as httpRequest } from "node:http";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import {
    pluginCatalogLoad,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

describe("agent port sharing audiences", () => {
    it("enforces internet, server, and live chat audiences with user-bound browser credentials", async () => {
        const pluginRoot = await portSharingPlugin();
        const upstreamRequests: Array<{
            authorization?: string;
            cookie?: string;
            path?: string;
            userId?: string;
        }> = [];
        const upstream = createServer((request, response) => {
            upstreamRequests.push({
                authorization: request.headers.authorization,
                cookie: request.headers.cookie,
                path: request.url,
                userId: request.headers["x-happy2-user-id"] as string | undefined,
            });
            response.writeHead(200, { "content-type": "text/plain" });
            response.end(`agent preview ${request.url}`);
        });
        const upstreamWebSocketRequests: Array<{
            authorization?: string;
            cookie?: string;
            userId?: string;
        }> = [];
        const upstreamWebSockets = new WebSocketServer({ server: upstream });
        upstreamWebSockets.on("connection", (socket, request) => {
            upstreamWebSocketRequests.push({
                authorization: request.headers.authorization,
                cookie: request.headers.cookie,
                userId: request.headers["x-happy2-user-id"] as string | undefined,
            });
            socket.on("message", (message) => socket.send(`agent websocket ${message.toString()}`));
        });
        await new Promise<void>((resolve, reject) => {
            upstream.once("error", reject);
            upstream.listen(0, "127.0.0.1", resolve);
        });
        const upstreamAddress = upstream.address();
        if (!upstreamAddress || typeof upstreamAddress === "string")
            throw new Error("Preview upstream did not bind a TCP port");
        let upstreamWebSocketsClosed = false;
        let upstreamClosed = false;
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const sandbox = new MockAgentSandboxRuntime();
        sandbox.setPortTarget(upstreamAddress.port);
        const runtime = new PortSharingRuntime();
        try {
            await using server = await createGymServer({
                agentSandbox: sandbox,
                pluginCatalog: await pluginCatalogLoad(pluginRoot),
                pluginMcpRuntime: runtime,
                configure(config) {
                    config.agents.enabled = true;
                    config.agents.socketPath = rig.socketPath;
                    config.agents.tokenPath = rig.tokenPath;
                    config.agents.defaultCwd = rig.workspaceRoot;
                    config.portSharing = {
                        publicDomain: "preview.gym.invalid",
                        publicUrl: "http://preview.gym.invalid",
                    };
                },
            });
            runtime.callHost = async ({ arguments_: input, chatToken, runtimeToken }) => {
                const headers = {
                    authorization: `Bearer ${runtimeToken}`,
                    "x-happy2-chat-token": chatToken,
                };
                const exposed = await server
                    .pluginHost()
                    .post("/port-shares/exposePort", input, { headers });
                if (exposed.statusCode !== 201)
                    return { statusCode: exposed.statusCode, body: exposed.json() };
                const portShareId = exposed.json().portShare.id as string;
                const duplicate = await server
                    .pluginHost()
                    .post(
                        "/port-shares/exposePort",
                        { name: "Duplicate Preview", port: 3001, audience: "internet" },
                        { headers },
                    );
                const listed = await server.pluginHost().get("/port-shares", { headers });
                const access = await server
                    .pluginHost()
                    .post(`/port-shares/${portShareId}/createAccessToken`, undefined, {
                        headers,
                    });
                return {
                    statusCode: access.statusCode,
                    body: {
                        ...exposed.json(),
                        access: access.json(),
                        duplicateStatus: duplicate.statusCode,
                        listed: listed.json(),
                    },
                };
            };

            const owner = await server.createUser({ username: "port_share_owner" });
            const outsider = await server.createUser({ username: "port_share_outsider" });
            const formerMember = await server.createUser({ username: "port_share_former_member" });
            const ownerClient = server.as(owner);
            const formerMemberClient = server.as(formerMember);
            const replacement = await prepareAgentImageReplacement(ownerClient);
            const installationId = await installPortSharingPlugin(ownerClient);
            const createdChannel = await ownerClient.post("/v0/chats/createChannel", {
                kind: "private_channel",
                name: "Port sharing",
                slug: "port-sharing",
            });
            expect(createdChannel.statusCode).toBe(201);
            expect(createdChannel.json().chat.defaultAgentUserId).toBe(replacement.agentUserId);
            const chatId = createdChannel.json().chat.id as string;
            expect(
                (
                    await ownerClient.post(`/v0/chats/${chatId}/addMember`, {
                        userId: formerMember.id,
                    })
                ).statusCode,
            ).toBe(200);
            expect(
                (
                    await ownerClient.post(`/v0/chats/${chatId}/sendMessage`, {
                        audience: "agents",
                        text: "Expose the documentation preview.",
                        clientMutationId: "expose-documentation-preview",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(() => rig.submittedRuns.length === 1, "agent turn submission");
            const run = rig.submittedRuns[0]!;
            const tool = run.externalTools.find(({ name }) =>
                name.includes(`plugin_${installationId}_happy2_port_share_expose_`),
            );
            if (!tool) throw new Error("Port-sharing tool was not submitted to Rig");
            const callId = rig.requestExternalToolCall(run.runId, tool.name, {
                name: "Documentation Preview",
                port: 3000,
                audience: "chat",
            });
            await waitFor(
                () => rig.externalToolCalls.find(({ id }) => id === callId)?.status !== "pending",
                "port-sharing tool completion",
            );
            const output = completedOutput(callId, rig);
            const share = output.portShare as {
                id: string;
                chatId: string;
                containerPort: number;
                name: string;
                subdomain: string;
                audience: "internet" | "server" | "chat";
                url: string;
            };
            const access = output.access as {
                token: string;
                expiresAt: string;
                refreshAfter: string;
                portShare: typeof share;
            };
            expect(share).toMatchObject({
                chatId,
                containerPort: 3000,
                name: "Documentation Preview",
                audience: "chat",
            });
            expect(share.subdomain).toMatch(/^documentation-preview-[a-z0-9]{6}$/);
            expect(share.url).toBe(`http://${share.subdomain}.preview.gym.invalid`);
            expect(new Date(access.refreshAfter).getTime() - Date.now()).toBeGreaterThan(
                14 * 60_000,
            );
            expect(new Date(access.expiresAt).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
            expect(access.portShare).toMatchObject(share);
            expect(output.duplicateStatus).toBe(409);
            expect(output.listed).toMatchObject({
                portShares: [expect.objectContaining(share)],
            });

            const listed = await ownerClient.get(`/v0/chats/${chatId}/portShares`);
            expect(listed.statusCode).toBe(200);
            expect(listed.json().portShares).toEqual([expect.objectContaining(share)]);
            expect(
                (await server.as(outsider).post(`/v0/portShares/${share.id}/createAccessToken`))
                    .statusCode,
            ).toBe(404);
            const formerMemberAccessResponse = await formerMemberClient.post(
                `/v0/portShares/${share.id}/createAccessToken`,
            );
            expect(formerMemberAccessResponse.statusCode).toBe(200);
            const formerMemberAccess = formerMemberAccessResponse.json() as typeof access;
            let serverUrl = await server.listen();
            const host = `${share.subdomain}.preview.gym.invalid`;
            const formerMemberExchange = await publicRequest(
                serverUrl,
                host,
                "/.happy2/auth/session",
                {
                    authorization: `Bearer ${formerMemberAccess.token}`,
                    origin: "http://gym.invalid",
                },
            );
            expect(formerMemberExchange.statusCode).toBe(200);
            const formerMemberCookie = formerMemberExchange.headers["set-cookie"];
            expect(
                (
                    await ownerClient.post(`/v0/chats/${chatId}/removeMember`, {
                        userId: formerMember.id,
                    })
                ).statusCode,
            ).toBe(200);
            expect(
                (await formerMemberClient.post(`/v0/portShares/${share.id}/createAccessToken`))
                    .statusCode,
            ).toBe(404);
            const revokedCookie = await publicRequest(serverUrl, host, "/revoked-cookie", {
                cookie: formerMemberCookie,
            });
            expect(revokedCookie.statusCode).toBe(302);
            expect(new URL(revokedCookie.headers.location!).pathname).toBe(
                `/preview-link/${share.id}`,
            );

            const copiedLink = await publicRequest(serverUrl, host, "/preview?copied=1");
            expect(copiedLink.statusCode).toBe(302);
            expect(copiedLink.headers["cache-control"]).toBe("no-store");
            expect(copiedLink.headers["referrer-policy"]).toBe("no-referrer");
            const mainAuthorization = new URL(copiedLink.headers.location!);
            expect(mainAuthorization.origin).toBe("http://gym.invalid");
            expect(mainAuthorization.pathname).toBe(`/preview-link/${share.id}`);
            expect(mainAuthorization.searchParams.get("returnTo")).toBe("/preview?copied=1");
            const backendAuthorizationPath = `/v0/portShares/${share.id}/openPortShare${mainAuthorization.search}`;
            expect((await server.get(backendAuthorizationPath)).statusCode).toBe(401);
            expect(
                (
                    await server.get(backendAuthorizationPath, {
                        headers: { cookie: `happy2_auth_token=${outsider.token}` },
                    })
                ).statusCode,
            ).toBe(404);
            expect(
                (
                    await server.get(
                        `/v0/portShares/${share.id}/openPortShare?returnTo=${encodeURIComponent("//evil.example/preview")}`,
                        { headers: { cookie: `happy2_auth_token=${owner.token}` } },
                    )
                ).statusCode,
            ).toBe(400);
            const authorizedOpen = await server.get(backendAuthorizationPath, {
                headers: { cookie: `happy2_auth_token=${owner.token}` },
            });
            expect(authorizedOpen.statusCode).toBe(302);
            expect(authorizedOpen.headers["cache-control"]).toBe("no-store");
            expect(authorizedOpen.headers["referrer-policy"]).toBe("no-referrer");
            const redemption = new URL(authorizedOpen.headers.location!);
            expect(redemption.origin).toBe(`http://${host}`);
            expect(redemption.pathname).toBe("/.happy2/auth/redeem");
            expect(redemption.searchParams.get("returnTo")).toBe("/preview?copied=1");
            const redemptionToken = redemption.searchParams.get("token");
            expect(redemptionToken).toBeTruthy();
            expect(jwtPayload(redemptionToken!)).toMatchObject({ sub: owner.id });
            expect(jwtPayload(redemptionToken!)).not.toHaveProperty("shr");
            expect(jwtPayload(redemptionToken!)).not.toHaveProperty("hst");
            expect(
                (
                    await publicRequest(
                        serverUrl,
                        "different.preview.gym.invalid",
                        `${redemption.pathname}${redemption.search}`,
                    )
                ).statusCode,
            ).toBe(404);
            const invalidRedemption = new URL(redemption);
            invalidRedemption.searchParams.set("returnTo", "//evil.example/preview");
            expectPortShareErrorPage(
                await publicRequest(
                    serverUrl,
                    host,
                    `${invalidRedemption.pathname}${invalidRedemption.search}`,
                ),
                400,
            );
            expectPortShareErrorPage(
                await publicRequest(serverUrl, host, "/redemption-is-not-access", {
                    authorization: `Bearer ${redemptionToken}`,
                }),
                401,
            );
            const redeemed = await publicRequest(
                serverUrl,
                host,
                `${redemption.pathname}${redemption.search}`,
            );
            expect(redeemed.statusCode).toBe(302);
            expect(redeemed.headers.location).toBe("/preview?copied=1");
            expect(redeemed.headers["cache-control"]).toBe("no-store");
            expect(redeemed.headers["referrer-policy"]).toBe("no-referrer");
            const copiedLinkCookie = redeemed.headers["set-cookie"];
            expect(copiedLinkCookie).toContain("happy2_port_share=");
            const copiedLinkClaims = jwtPayload(cookieValue(copiedLinkCookie));
            expect(copiedLinkClaims).toMatchObject({ sub: owner.id, hst: share.subdomain });
            expect(copiedLinkClaims).not.toHaveProperty("shr");
            expect(
                (
                    await publicRequest(serverUrl, host, "/preview?copied=1", {
                        cookie: copiedLinkCookie,
                    })
                ).body,
            ).toBe("agent preview /preview?copied=1");
            expect(
                (
                    await publicRequest(serverUrl, host, "/former-member", {
                        authorization: `Bearer ${formerMemberAccess.token}`,
                    })
                ).statusCode,
            ).toBe(401);
            expect(await websocketUpgradeStatus(serverUrl, host, "/socket")).toBe(401);
            const bearerResponse = await publicRequest(serverUrl, host, "/preview?mode=full", {
                authorization: `Bearer ${access.token}`,
            });
            expect(bearerResponse).toMatchObject({
                statusCode: 200,
                body: "agent preview /preview?mode=full",
            });
            expect(upstreamRequests.at(-1)).toEqual({
                authorization: undefined,
                cookie: undefined,
                path: "/preview?mode=full",
                userId: owner.id,
            });
            expect(
                (
                    await publicRequest(serverUrl, "different.preview.gym.invalid", "/preview", {
                        authorization: `Bearer ${access.token}`,
                    })
                ).statusCode,
            ).toBe(404);

            const revokedExchange = await publicRequest(serverUrl, host, "/.happy2/auth/session", {
                authorization: `Bearer ${formerMemberAccess.token}`,
                origin: "http://gym.invalid",
            });
            expect(revokedExchange.statusCode).toBe(401);
            const exchanged = await publicRequest(serverUrl, host, "/.happy2/auth/session", {
                authorization: `Bearer ${access.token}`,
                origin: "http://gym.invalid",
            });
            expect(exchanged.statusCode).toBe(200);
            expect(exchanged.headers["access-control-allow-origin"]).toBe("http://gym.invalid");
            const cookie = exchanged.headers["set-cookie"];
            expect(cookie).toContain("happy2_port_share=");
            expect(cookie).toContain("Max-Age=3600");
            expect(cookie).toContain("HttpOnly");
            expect((await publicRequest(serverUrl, host, "/from-cookie", { cookie })).body).toBe(
                "agent preview /from-cookie",
            );
            expect(
                await websocketRoundTrip(serverUrl, host, "/socket", "hello", {
                    cookie,
                }),
            ).toBe("agent websocket hello");
            expect(upstreamWebSocketRequests).toEqual([
                {
                    authorization: undefined,
                    cookie: undefined,
                    userId: owner.id,
                },
            ]);
            expect(sandbox.portResolutionCount).toBe(1);

            rig.completeRun(run.runId, "The documentation preview is ready.");
            await waitFor(async () => {
                const messages = await ownerClient.get(`/v0/chats/${chatId}/messages`);
                return messages
                    .json()
                    .messages.some(
                        (message: { text?: string }) =>
                            message.text === "The documentation preview is ready.",
                    );
            }, "agent turn completion");
            await server.restart();
            serverUrl = await server.listen();
            await waitForInstallationReady(ownerClient, installationId);
            const staleContainerName = rig.createdSessions.at(-1)?.docker?.container;
            if (!staleContainerName) throw new Error("Shared agent container was not recorded");
            sandbox.setSandboxConfigurationHash(staleContainerName, undefined);
            const containersBeforeLazyRepair = sandbox.createdContainers.length;
            const sessionsBeforeLazyRepair = rig.createdSessions.length;
            expect(
                (
                    await publicRequest(serverUrl, host, "/after-restart", {
                        authorization: `Bearer ${access.token}`,
                    })
                ).body,
            ).toBe("agent preview /after-restart");
            expect(sandbox.createdContainers).toHaveLength(containersBeforeLazyRepair + 1);
            expect(rig.createdSessions).toHaveLength(sessionsBeforeLazyRepair + 1);
            expect(sandbox.removedContainers).toContain(staleContainerName);
            expect(sandbox.createdContainers.at(-1)?.configurationHash).toMatch(/^[a-f0-9]{64}$/u);
            expect(sandbox.portResolutionCount).toBe(2);

            const changedImage = await ownerClient.post(
                `/v0/admin/agents/${replacement.agentUserId}/changeImage`,
                { imageId: replacement.imageId },
            );
            expect(changedImage.statusCode).toBe(200);
            expect(
                (
                    await ownerClient.post(`/v0/chats/${chatId}/sendMessage`, {
                        audience: "agents",
                        text: "Expose the replacement preview.",
                        clientMutationId: "expose-replacement-preview",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(() => rig.submittedRuns.length === 2, "replacement agent turn");
            const replacementRun = rig.submittedRuns[1]!;
            const replacementTool = replacementRun.externalTools.find(({ name }) =>
                name.includes(`plugin_${installationId}_happy2_port_share_expose_`),
            );
            if (!replacementTool)
                throw new Error("Replacement port-sharing tool was not submitted");
            const replacementCallId = rig.requestExternalToolCall(
                replacementRun.runId,
                replacementTool.name,
                { name: "Replacement Preview", port: 3001, audience: "server" },
            );
            await waitFor(
                () =>
                    rig.externalToolCalls.find(({ id }) => id === replacementCallId)?.status !==
                    "pending",
                "replacement port-sharing tool completion",
            );
            const replacementShare = completedOutput(replacementCallId, rig)
                .portShare as typeof share;
            expect(replacementShare).toMatchObject({
                chatId,
                containerPort: 3001,
                name: "Replacement Preview",
                audience: "server",
            });
            expect(replacementShare.id).not.toBe(share.id);
            const replacementAccessResponse = await ownerClient.post(
                `/v0/portShares/${replacementShare.id}/createAccessToken`,
            );
            expect(replacementAccessResponse.statusCode).toBe(200);
            const replacementAccess = replacementAccessResponse.json() as typeof access;
            const outsiderAccessResponse = await server
                .as(outsider)
                .post(`/v0/portShares/${replacementShare.id}/createAccessToken`);
            expect(outsiderAccessResponse.statusCode).toBe(200);
            const outsiderAccess = outsiderAccessResponse.json() as typeof access;
            const replacementHost = `${replacementShare.subdomain}.preview.gym.invalid`;
            expect(
                (
                    await publicRequest(serverUrl, replacementHost, "/replacement", {
                        authorization: `Bearer ${replacementAccess.token}`,
                    })
                ).body,
            ).toBe("agent preview /replacement");
            expect(
                (
                    await publicRequest(serverUrl, replacementHost, "/server-user", {
                        authorization: `Bearer ${outsiderAccess.token}`,
                    })
                ).body,
            ).toBe("agent preview /server-user");
            expect((await publicRequest(serverUrl, replacementHost, "/anonymous")).statusCode).toBe(
                302,
            );
            expect(sandbox.portResolutionCount).toBe(3);
            expectPortShareErrorPage(
                await publicRequest(serverUrl, host, "/replaced", {
                    authorization: `Bearer ${access.token}`,
                }),
                404,
            );

            const disabled = await ownerClient.post(
                `/v0/chats/${chatId}/portShares/${replacementShare.id}/disablePortShare`,
            );
            expect(disabled.statusCode).toBe(200);
            expect(disabled.json().portShare).toMatchObject({
                id: replacementShare.id,
                disabledAt: expect.any(String),
            });
            expect(
                (await ownerClient.get(`/v0/chats/${chatId}/portShares`)).json().portShares,
            ).toEqual([]);
            expect(
                (
                    await publicRequest(serverUrl, host, "/disabled", {
                        authorization: `Bearer ${access.token}`,
                    })
                ).statusCode,
            ).toBe(404);
            expect(
                (await ownerClient.post(`/v0/portShares/${share.id}/createAccessToken`)).statusCode,
            ).toBe(404);

            rig.completeRun(replacementRun.runId, "The replacement preview is ready.");
            await waitFor(async () => {
                const messages = await ownerClient.get(`/v0/chats/${chatId}/messages`);
                return messages
                    .json()
                    .messages.some(
                        (message: { text?: string }) =>
                            message.text === "The replacement preview is ready.",
                    );
            }, "replacement agent turn completion");
            expect(
                (
                    await ownerClient.post(`/v0/chats/${chatId}/sendMessage`, {
                        audience: "agents",
                        text: "Expose an internet preview.",
                        clientMutationId: "expose-internet-preview",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(() => rig.submittedRuns.length === 3, "internet agent turn");
            const internetRun = rig.submittedRuns[2]!;
            const internetTool = internetRun.externalTools.find(({ name }) =>
                name.includes(`plugin_${installationId}_happy2_port_share_expose_`),
            );
            if (!internetTool) throw new Error("Internet port-sharing tool was not submitted");
            const internetCallId = rig.requestExternalToolCall(
                internetRun.runId,
                internetTool.name,
                { name: "Internet Preview", port: 3002, audience: "internet" },
            );
            await waitFor(
                () =>
                    rig.externalToolCalls.find(({ id }) => id === internetCallId)?.status !==
                    "pending",
                "internet port-sharing tool completion",
            );
            const internetShare = completedOutput(internetCallId, rig).portShare as typeof share;
            expect(internetShare).toMatchObject({
                chatId,
                containerPort: 3002,
                audience: "internet",
            });
            const internetHost = `${internetShare.subdomain}.preview.gym.invalid`;
            expect((await publicRequest(serverUrl, internetHost, "/anyone")).body).toBe(
                "agent preview /anyone",
            );
            expect(upstreamRequests.at(-1)).toMatchObject({
                authorization: undefined,
                cookie: undefined,
                path: "/anyone",
                userId: undefined,
            });
            expect(await websocketRoundTrip(serverUrl, internetHost, "/socket", "public")).toBe(
                "agent websocket public",
            );
            await new Promise<void>((resolve) => upstreamWebSockets.close(() => resolve()));
            upstreamWebSocketsClosed = true;
            await new Promise<void>((resolve) => upstream.close(() => resolve()));
            upstreamClosed = true;
            expectPortShareErrorPage(await publicRequest(serverUrl, internetHost, "/stopped"), 502);
        } finally {
            if (!upstreamWebSocketsClosed)
                await new Promise<void>((resolve) => upstreamWebSockets.close(() => resolve()));
            if (!upstreamClosed)
                await new Promise<void>((resolve) => upstream.close(() => resolve()));
            await rm(pluginRoot, { recursive: true, force: true });
        }
    }, 30_000);
});

class PortSharingRuntime implements PluginMcpRuntime {
    private readonly containers = new Map<
        string,
        { installationId: string; containerInstanceId: string }
    >();
    callHost?: (input: {
        arguments_: Record<string, unknown>;
        chatToken: string;
        runtimeToken: string;
    }) => Promise<{ statusCode: number; body: Record<string, unknown> }>;

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

    async startLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async monitorLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async openLocal(input: PluginLocalOpenInput) {
        const runtimeToken = input.environment.HAPPY2_PLUGIN_API_TOKEN;
        if (!runtimeToken) throw new Error("Plugin runtime token was not supplied");
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
                        serverInfo: { name: "port-sharing-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = {
                        tools: [
                            {
                                name: "happy2_port_shares_list",
                                title: "List shared ports",
                                description: "Lists active shares in the current chat.",
                                inputSchema: {
                                    type: "object",
                                    properties: {},
                                    additionalProperties: false,
                                },
                            },
                            {
                                name: "happy2_port_share_expose",
                                title: "Expose a container port",
                                description:
                                    "Exposes one fixed port from the current chat agent container.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        port: { type: "integer", minimum: 3000, maximum: 3010 },
                                        audience: {
                                            type: "string",
                                            enum: ["internet", "server", "chat"],
                                        },
                                    },
                                    required: ["name", "port", "audience"],
                                    additionalProperties: false,
                                },
                            },
                            {
                                name: "happy2_port_share_disable",
                                title: "Stop sharing a port",
                                description: "Disables one exact active share.",
                                inputSchema: {
                                    type: "object",
                                    properties: { portShareId: { type: "string" } },
                                    required: ["portShareId"],
                                    additionalProperties: false,
                                },
                            },
                            {
                                name: "happy2_port_share_create_access_token",
                                title: "Create a port-share access token",
                                description: "Creates a user-scoped access token.",
                                inputSchema: {
                                    type: "object",
                                    properties: { portShareId: { type: "string" } },
                                    required: ["portShareId"],
                                    additionalProperties: false,
                                },
                            },
                            {
                                name: "happy2_port_share_probe",
                                title: "Verify a shared endpoint",
                                description: "Checks a share with an internally issued token.",
                                inputSchema: {
                                    type: "object",
                                    properties: { portShareId: { type: "string" } },
                                    required: ["portShareId"],
                                    additionalProperties: false,
                                },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const call = structuredClone(message.params) as {
                        _meta?: Record<string, unknown>;
                        arguments: Record<string, unknown>;
                    };
                    const chat = call._meta?.["happy2/chat"] as { token?: unknown } | undefined;
                    if (typeof chat?.token !== "string")
                        throw new Error("Plugin chat capability was not supplied");
                    const response = await this.callHost?.({
                        arguments_: call.arguments,
                        chatToken: chat.token,
                        runtimeToken,
                    });
                    if (!response) throw new Error("Plugin host callback is unavailable");
                    result =
                        response.statusCode >= 200 && response.statusCode < 300
                            ? {
                                  content: [{ type: "text", text: "Port exposed." }],
                                  structuredContent: response.body,
                              }
                            : {
                                  isError: true,
                                  content: [
                                      {
                                          type: "text",
                                          text: String(
                                              response.body.message ?? "Port share failed",
                                          ),
                                      },
                                  ],
                              };
                } else result = {};
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async isLocalRunning(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean> {
        const container = this.containers.get(containerName);
        return (
            container?.installationId === installationId &&
            container.containerInstanceId === containerInstanceId
        );
    }

    async removeLocal(containerName: string): Promise<void> {
        this.containers.delete(containerName);
    }
}

async function portSharingPlugin(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "happy2-port-sharing-plugin-"));
    await cp(
        join(process.cwd(), "..", "happy2-server", "dist", "plugins", "port-sharing"),
        join(root, "port-sharing"),
        { recursive: true },
    );
    return root;
}

async function installPortSharingPlugin(client: GymRequestClient): Promise<string> {
    const catalog = await client.get("/v0/admin/plugins");
    expect(catalog.statusCode).toBe(200);
    expect(
        catalog
            .json()
            .plugins.find((plugin: { shortName: string }) => plugin.shortName === "port-sharing"),
    ).toMatchObject({
        displayName: "Port Sharing",
        skills: [{ name: "happy2-port-sharing" }],
    });
    const installed = await client.post("/v0/admin/plugins/port-sharing/installPlugin", {
        permissions: [
            "port-sharing:read",
            "port-sharing:expose",
            "port-sharing:disable",
            "port-sharing:access",
        ],
    });
    expect(installed.statusCode).toBe(202);
    const installationId = installed.json().installation.id as string;
    await waitForInstallationReady(client, installationId);
    return installationId;
}

async function waitForInstallationReady(
    client: GymRequestClient,
    installationId: string,
): Promise<void> {
    await waitFor(async () => {
        const catalog = await client.get("/v0/admin/plugins");
        return catalog
            .json()
            .plugins.flatMap(
                (plugin: {
                    systemPlugin?: { installations?: Array<{ id: string; status: string }> };
                }) => plugin.systemPlugin?.installations ?? [],
            )
            .some(
                (installation: { id: string; status: string }) =>
                    installation.id === installationId && installation.status === "ready",
            );
    }, "port-sharing plugin readiness");
}

async function prepareAgentImageReplacement(client: GymRequestClient): Promise<{
    agentUserId: string;
    imageId: string;
}> {
    const agent = (
        (await client.get("/v0/contacts")).json().users as Array<{
            agentImageId?: string;
            id: string;
            kind: string;
        }>
    ).find(({ kind }) => kind === "agent");
    if (!agent?.agentImageId) throw new Error("Default agent image was not found");
    const catalog = (await client.get("/v0/admin/agentImages")).json() as {
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const replacement = catalog.images.find(
        ({ builtinKey, id }) => builtinKey !== undefined && id !== agent.agentImageId,
    );
    if (!replacement) throw new Error("Alternate built-in agent image was not found");
    if (replacement.status !== "ready") {
        const build = await client.post(`/v0/admin/agentImages/${replacement.id}/buildImage`, {});
        expect(build.statusCode).toBe(202);
        await waitFor(async () => {
            const images = (await client.get("/v0/admin/agentImages")).json().images as Array<{
                id: string;
                status: string;
            }>;
            return images.find(({ id }) => id === replacement.id)?.status === "ready";
        }, "replacement agent image build");
    }
    return { agentUserId: agent.id, imageId: replacement.id };
}

function completedOutput(
    callId: string,
    rig: Awaited<ReturnType<typeof createMockRigDaemon>>,
): Record<string, unknown> {
    const call = rig.externalToolCalls.find(({ id }) => id === callId);
    if (call?.status !== "completed" || call.resolution?.status !== "completed")
        throw new Error(`Tool call failed: ${JSON.stringify(call?.resolution)}`);
    const output = call.resolution.output as { structuredContent?: unknown };
    if (!output.structuredContent || typeof output.structuredContent !== "object")
        throw new Error("Tool call did not return structured content");
    return output.structuredContent as Record<string, unknown>;
}

async function publicRequest(
    serverUrl: string,
    host: string,
    path: string,
    headers: { authorization?: string; cookie?: string; origin?: string } = {},
): Promise<{ body: string; headers: Record<string, string | undefined>; statusCode: number }> {
    const address = new URL(serverUrl);
    return new Promise((resolve, reject) => {
        const request = httpRequest(
            {
                host: address.hostname,
                port: Number(address.port),
                path,
                method: "GET",
                headers: { host, ...headers },
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                response.on("end", () =>
                    resolve({
                        statusCode: response.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString("utf8"),
                        headers: Object.fromEntries(
                            Object.entries(response.headers).map(([name, value]) => [
                                name,
                                Array.isArray(value) ? value.join("; ") : value,
                            ]),
                        ),
                    }),
                );
            },
        );
        request.once("error", reject);
        request.end();
    });
}

function expectPortShareErrorPage(
    response: Awaited<ReturnType<typeof publicRequest>>,
    statusCode: number,
): void {
    expect(response.statusCode).toBe(statusCode);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.body).toMatch(/^<!doctype html>/);
    expect(response.body).toContain("This preview isn’t available");
    expect(response.body).toContain("@media (prefers-color-scheme: dark)");
    expect(response.body).not.toMatch(/<(?:script|link)\b|\b(?:href|src)=|https?:\/\//i);
}

async function websocketUpgradeStatus(
    serverUrl: string,
    host: string,
    path: string,
): Promise<number> {
    const url = new URL(path, serverUrl);
    url.protocol = "ws:";
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers: { host } });
        let settled = false;
        socket.once("unexpected-response", (_request, response) => {
            settled = true;
            response.resume();
            resolve(response.statusCode ?? 0);
        });
        socket.once("open", () => {
            settled = true;
            socket.close();
            resolve(101);
        });
        socket.once("error", (error) => {
            if (!settled) reject(error);
        });
    });
}

async function websocketRoundTrip(
    serverUrl: string,
    host: string,
    path: string,
    message: string,
    credentials: { authorization?: string; cookie?: string } = {},
): Promise<string> {
    const url = new URL(path, serverUrl);
    url.protocol = "ws:";
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers: { host, ...credentials } });
        socket.once("open", () => socket.send(message));
        socket.once("message", (reply) => {
            socket.close();
            resolve(reply.toString());
        });
        socket.once("error", reject);
    });
}

function cookieValue(setCookie: string | undefined): string {
    const value = setCookie?.match(/(?:^|; )happy2_port_share=([^;]+)/)?.[1];
    if (!value) throw new Error("Port-share cookie was not set");
    return value;
}

function jwtPayload(token: string): Record<string, unknown> {
    const payload = token.split(".")[1];
    if (!payload) throw new Error("JWT payload is missing");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
        string,
        unknown
    >;
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
