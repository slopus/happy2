import { describe, expect, it } from "vitest";
import type {
    PluginLocalOpenInput,
    PluginLocalPrepareInput,
    PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

describe("agent plugin chat capabilities", () => {
    it("injects an installation-bound current-chat token and lets Chat Management update only that chat", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const runtime = new ChatManagementRuntime();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            pluginMcpRuntime: runtime,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        runtime.update = async ({ chatToken, input, runtimeToken }) => {
            const response = await server.pluginHost().post("/chats/updateChat", input, {
                headers: {
                    authorization: `Bearer ${runtimeToken}`,
                    "x-happy2-chat-token": chatToken,
                },
            });
            return { statusCode: response.statusCode, body: response.json() };
        };
        const owner = await server.createUser({ username: "plugin_chat_owner" });
        const client = server.as(owner);
        const first = await install(client);
        const second = await install(client);
        const chatId = await createAgent(client);

        expect(
            (
                await server.pluginHost().post(
                    "/chats/updateChat",
                    { title: "Missing capability" },
                    {
                        headers: {
                            authorization: `Bearer ${runtime.tokenFor(first)}`,
                        },
                    },
                )
            ).statusCode,
        ).toBe(403);

        expect(
            (
                await client.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Rename this conversation for the release work.",
                    clientMutationId: "chat-management-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
        const run = rig.submittedRuns[0]!;
        const tool = run.externalTools.find(({ name }) =>
            name.includes(`plugin_${first}_chat_update_`),
        );
        if (!tool) throw new Error("The first Chat Management tool was not submitted to Rig");
        const callId = rig.requestExternalToolCall(run.runId, tool.name, {
            title: "Boston release",
            description: "Tracks the final release work.",
        });
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === callId)?.status !== "pending",
            "chat management tool completion",
        );
        const resolvedCall = rig.externalToolCalls.find(({ id }) => id === callId);
        if (resolvedCall?.status !== "completed")
            throw new Error(`Chat management failed: ${JSON.stringify(resolvedCall?.resolution)}`);

        expect(runtime.calls).toHaveLength(1);
        const call = runtime.calls[0]!;
        expect(call).toMatchObject({
            name: "chat_update",
            arguments: {
                title: "Boston release",
                description: "Tracks the final release work.",
            },
            _meta: {
                "happy2/chat": {
                    id: chatId,
                    token: expect.any(String),
                    triggeredByUserId: owner.id,
                },
                "happy2/users": [
                    expect.objectContaining({
                        id: owner.id,
                        username: "plugin_chat_owner",
                        triggeredTurn: true,
                        token: expect.any(String),
                    }),
                ],
            },
        });
        expect(rig.externalToolCalls.find(({ id }) => id === callId)?.resolution).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    chat: {
                        id: chatId,
                        title: "Boston release",
                        description: "Tracks the final release work.",
                    },
                },
            },
        });
        expect((await client.get(`/v0/chats/${chatId}`)).json().chat).toMatchObject({
            id: chatId,
            name: "Boston release",
            topic: "Tracks the final release work.",
        });

        const chatToken = chatMeta(call).token;
        const wrongInstallation = await server.pluginHost().post(
            "/chats/updateChat",
            { title: "Cross-installation replay" },
            {
                headers: {
                    authorization: `Bearer ${runtime.tokenFor(second)}`,
                    "x-happy2-chat-token": chatToken,
                },
            },
        );
        expect(wrongInstallation.statusCode).toBe(403);
        expect(wrongInstallation.json().message).toContain("another installation");

        const spoofedId = await server.pluginHost().post(
            "/chats/updateChat",
            { id: "some-other-chat", title: "Spoofed" },
            {
                headers: {
                    authorization: `Bearer ${runtime.tokenFor(first)}`,
                    "x-happy2-chat-token": chatToken,
                },
            },
        );
        expect(spoofedId.statusCode).toBe(400);
        expect((await client.get(`/v0/chats/${chatId}`)).json().chat.name).toBe("Boston release");
    }, 30_000);

    it("adds triggering and mentioned users to MCP metadata and creates or manages channels with explicit inference", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const runtime = new ChatManagementRuntime();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            pluginMcpRuntime: runtime,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        let persistedUsers: ReferencedUser[] | undefined;
        let mismatchedUserTokenResult:
            | { statusCode: number; body: Record<string, unknown> }
            | undefined;
        let replayedPeopleResult: { statusCode: number; body: Record<string, unknown> } | undefined;
        let replayedProjectResult:
            | { statusCode: number; body: Record<string, unknown> }
            | undefined;
        runtime.action = async ({ call, chatToken, runtimeToken }) => {
            const users =
                call.name === "channel_members_update" && persistedUsers
                    ? persistedUsers
                    : referencedUsers(call);
            const request =
                call.name === "project_create"
                    ? {
                          path: "/projects/createProject",
                          body: {
                              ...call.arguments,
                              owner: selectCapabilities([call.arguments.owner], users)[0],
                              people: selectCapabilities(call.arguments.people, users),
                              idempotencyKey: "gym-project-create",
                          },
                      }
                    : call.name === "channel_members_update"
                      ? {
                            path: "/channels/updateMembers",
                            body: {
                                add: selectCapabilities(call.arguments.addUsers, users),
                                remove: selectCapabilities(call.arguments.removeUsers, users),
                            },
                        }
                      : call.name === "channel_child_create"
                        ? {
                              path: "/channels/createChildChannel",
                              body: call.arguments,
                          }
                        : call.name === "message_send"
                          ? {
                                path: "/messages/send",
                                body: {
                                    ...call.arguments,
                                    idempotencyKey: `gym-message-${runtime.calls.indexOf(call)}`,
                                },
                            }
                          : {
                                path: "/channels/createChannel",
                                body: {
                                    ...call.arguments,
                                    idempotencyKey: `gym-${String(call.arguments.name)
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, "-")}`,
                                    members: selectCapabilities(call.arguments.members, users),
                                },
                            };
            const response = await server.pluginHost().post(request.path, request.body, {
                headers: {
                    authorization: `Bearer ${runtimeToken}`,
                    "x-happy2-chat-token": chatToken,
                },
            });
            if (
                call.name === "channel_create" &&
                (call.arguments.initialMessage as { audience?: string } | undefined)?.audience ===
                    "people"
            ) {
                const mismatched = await server.pluginHost().post(
                    "/channels/updateMembers",
                    {
                        add: [{ id: users[1]!.id, token: users[2]!.token }],
                        remove: [],
                    },
                    {
                        headers: {
                            authorization: `Bearer ${runtimeToken}`,
                            "x-happy2-chat-token": chatToken,
                        },
                    },
                );
                mismatchedUserTokenResult = {
                    statusCode: mismatched.statusCode,
                    body: mismatched.json(),
                };
                const replayed = await server.pluginHost().post(request.path, request.body, {
                    headers: {
                        authorization: `Bearer ${runtimeToken}`,
                        "x-happy2-chat-token": chatToken,
                    },
                });
                replayedPeopleResult = {
                    statusCode: replayed.statusCode,
                    body: replayed.json(),
                };
            }
            if (call.name === "project_create") {
                const replayed = await server.pluginHost().post(request.path, request.body, {
                    headers: {
                        authorization: `Bearer ${runtimeToken}`,
                        "x-happy2-chat-token": chatToken,
                    },
                });
                replayedProjectResult = {
                    statusCode: replayed.statusCode,
                    body: replayed.json(),
                };
            }
            return { statusCode: response.statusCode, body: response.json() };
        };
        const owner = await server.createUser({
            username: "channel_capability_owner",
            firstName: "Owner",
        });
        const friend = await server.createUser({ username: "feature_friend", firstName: "Friend" });
        const reviewer = await server.createUser({
            username: "feature_reviewer",
            firstName: "Reviewer",
        });
        const client = server.as(owner);
        const installationId = await install(client);
        const originChatId = await createAgent(client);
        const triggeringMessage = await client.post(`/v0/chats/${originChatId}/sendMessage`, {
            text: "Create feature channels with @feature_friend and @feature_reviewer.",
            clientMutationId: "channel-capability-turn",
        });
        expect(triggeringMessage.statusCode).toBe(201);
        expect(triggeringMessage.json().message).toMatchObject({
            sender: { id: owner.id },
            kind: "user",
            automated: false,
        });
        await waitFor(() => rig.submittedRuns.length === 1, "origin Rig submission");
        const originRun = rig.submittedRuns[0]!;
        const createTool = originRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_channel_create_`),
        );
        const membersTool = originRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_channel_members_update_`),
        );
        const messageTool = originRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_message_send_`),
        );
        const projectTool = originRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_project_create_`),
        );
        if (!createTool || !membersTool || !messageTool || !projectTool)
            throw new Error("Chat Management channel tools were not submitted to Rig");

        const projectCallId = rig.requestExternalToolCall(originRun.runId, projectTool.name, {
            name: "Delegated launch",
            description: "A mixed-visibility project provisioned by the agent.",
            owner: "@feature_reviewer",
            people: ["@feature_friend"],
            channels: [
                { name: "Launch lobby", visibility: "public" },
                {
                    name: "Launch command",
                    description: "Private launch coordination.",
                    visibility: "private",
                },
            ],
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === projectCallId)?.status !== "pending",
            "project creation",
        );
        const projectResolution = completedOutput(projectCallId, rig);
        const project = projectResolution.project as { id: string; createdByUserId: string };
        const projectChannels = projectResolution.channels as Array<{
            chat: {
                id: string;
                kind: "public_channel" | "private_channel";
                createdByUserId: string;
                ownerUserId?: string;
                projectId: string;
            };
            token: string;
        }>;
        expect(project).toMatchObject({
            id: expect.any(String),
            createdByUserId: reviewer.id,
        });
        expect(projectChannels).toHaveLength(2);
        expect(
            projectChannels.every(({ token }) => typeof token === "string" && token.length > 0),
        ).toBe(true);
        const publicProjectChannel = projectChannels.find(
            ({ chat }) => chat.kind === "public_channel",
        )!.chat;
        const privateProjectChannel = projectChannels.find(
            ({ chat }) => chat.kind === "private_channel",
        )!.chat;
        expect(publicProjectChannel).toMatchObject({
            createdByUserId: reviewer.id,
            projectId: project.id,
        });
        expect(publicProjectChannel).not.toHaveProperty("ownerUserId");
        expect(privateProjectChannel).toMatchObject({
            createdByUserId: reviewer.id,
            ownerUserId: reviewer.id,
            projectId: project.id,
        });
        expect(replayedProjectResult?.statusCode).toBe(201);
        expect(
            (replayedProjectResult?.body.channels as Array<{ chat: { id: string } }>).map(
                ({ chat }) => chat.id,
            ),
        ).toEqual(projectChannels.map(({ chat }) => chat.id));
        expect(
            (await client.get(`/v0/chats/${privateProjectChannel.id}`)).json().chat,
        ).toMatchObject({
            membershipRole: "admin",
        });
        expect(
            (await server.as(reviewer).get(`/v0/chats/${privateProjectChannel.id}`)).json().chat,
        ).toMatchObject({ membershipRole: "owner" });
        expect(
            (await server.as(reviewer).get(`/v0/chats/${publicProjectChannel.id}`)).json().chat,
        ).toMatchObject({ membershipRole: "admin" });
        expect(
            (await server.as(friend).get(`/v0/chats/${privateProjectChannel.id}`)).json().chat,
        ).toMatchObject({ membershipRole: "member" });
        expect(
            (await server.as(friend).get(`/v0/chats/${publicProjectChannel.id}`)).json().chat,
        ).toMatchObject({ membershipRole: "member" });

        const peopleInput = {
            name: "Feature briefing",
            visibility: "private",
            description: "Context for the feature without starting an agent.",
            members: ["@feature_friend"],
            initialMessage: {
                audience: "people",
                text: "Background for @feature_friend and @feature_reviewer; no action yet.",
            },
        };
        const peopleCallId = rig.requestExternalToolCall(
            originRun.runId,
            createTool.name,
            peopleInput,
        );
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === peopleCallId)?.status !== "pending",
            "people channel creation",
        );
        const peopleCall = runtime.calls.find(({ name }) => name === "channel_create");
        if (!peopleCall) throw new Error("People channel creation was not received by the plugin");
        expect(referencedUsers(peopleCall)).toEqual([
            expect.objectContaining({
                id: owner.id,
                username: "channel_capability_owner",
                triggeredTurn: true,
                token: expect.any(String),
            }),
            expect.objectContaining({
                id: friend.id,
                username: "feature_friend",
                triggeredTurn: false,
                token: expect.any(String),
            }),
            expect.objectContaining({
                id: reviewer.id,
                username: "feature_reviewer",
                triggeredTurn: false,
                token: expect.any(String),
            }),
        ]);
        persistedUsers = referencedUsers(peopleCall);
        expect(mismatchedUserTokenResult?.statusCode).toBe(403);
        expect(mismatchedUserTokenResult?.body.message).toContain("another user");
        const peopleResolution = completedOutput(peopleCallId, rig);
        const peopleChatId = (peopleResolution.chat as { id: string }).id;
        expect(replayedPeopleResult?.statusCode).toBe(201);
        expect((replayedPeopleResult?.body.chat as { id: string }).id).toBe(peopleChatId);
        expect(rig.submittedRuns).toHaveLength(1);
        expect(
            (await client.get(`/v0/chats/${peopleChatId}/messages`))
                .json()
                .messages.filter(
                    ({ text }: { text: string }) =>
                        text ===
                        "Background for @feature_friend and @feature_reviewer; no action yet.",
                ),
        ).toEqual([
            expect.objectContaining({
                audience: "people",
                automated: true,
                text: "Background for @feature_friend and @feature_reviewer; no action yet.",
            }),
        ]);
        expect((await server.as(friend).get(`/v0/chats/${peopleChatId}`)).statusCode).toBe(200);
        expect((await server.as(reviewer).get(`/v0/chats/${peopleChatId}`)).statusCode).toBe(404);

        const dmMembershipCallId = rig.requestExternalToolCall(originRun.runId, membersTool.name, {
            addUsers: ["feature_friend"],
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === dmMembershipCallId)?.status !==
                "pending",
            "direct-message membership rejection",
        );
        expect(
            rig.externalToolCalls.find(({ id }) => id === dmMembershipCallId)?.resolution,
        ).toMatchObject({
            status: "failed",
            error: { message: expect.stringContaining("Direct-message") },
        });

        const agentCallId = rig.requestExternalToolCall(originRun.runId, createTool.name, {
            name: "Feature implementation",
            visibility: "private",
            members: ["feature_friend"],
            initialMessage: {
                audience: "agents",
                text: "Implement the feature with @feature_friend and ask @feature_reviewer for review.",
            },
        });
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === agentCallId)?.status !== "pending",
            "agent channel creation",
        );
        const agentResolution = completedOutput(agentCallId, rig);
        const agentChatId = (agentResolution.chat as { id: string }).id;
        await waitFor(() => rig.submittedRuns.length === 2, "new channel agent turn");
        expect((await client.get(`/v0/chats/${agentChatId}/messages`)).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    audience: "agents",
                    automated: true,
                    text: "Implement the feature with @feature_friend and ask @feature_reviewer for review.",
                }),
            ]),
        );
        const channelRun = rig.submittedRuns[1]!;
        const channelMembersTool = channelRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_channel_members_update_`),
        );
        const childChannelTool = channelRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_channel_child_create_`),
        );
        const channelMessageTool = channelRun.externalTools.find(({ name }) =>
            name.includes(`plugin_${installationId}_message_send_`),
        );
        if (!channelMembersTool || !childChannelTool || !channelMessageTool)
            throw new Error("New channel did not receive its channel management tools");
        const childCallId = rig.requestExternalToolCall(channelRun.runId, childChannelTool.name, {
            name: "Feature parallel investigation",
            description: "Shares the implementation workspace with an independent history.",
            agentModelId: "gym/alternate-agent",
            initialMessage: {
                audience: "people",
                text: "Child-only context without starting its agent yet.",
            },
        });
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === childCallId)?.status !== "pending",
            "child channel creation",
        );
        const childResolution = completedOutput(childCallId, rig);
        const childChat = childResolution.chat as {
            id: string;
            parentChatId: string;
            agentModelId: string;
        };
        expect(childChat).toMatchObject({
            parentChatId: agentChatId,
            agentModelId: "gym/alternate-agent",
        });
        expect(childResolution.initialMessage).toMatchObject({
            chatId: childChat.id,
            sender: { id: owner.id },
            automated: true,
            audience: "people",
            text: "Child-only context without starting its agent yet.",
        });
        expect(rig.submittedRuns).toHaveLength(2);
        expect((await server.as(friend).get(`/v0/chats/${childChat.id}`)).statusCode).toBe(404);
        expect((await server.as(friend).post(`/v0/chats/${childChat.id}/join`)).statusCode).toBe(
            200,
        );
        const updateCallId = rig.requestExternalToolCall(
            channelRun.runId,
            channelMembersTool.name,
            {
                addUsers: ["@feature_reviewer"],
                removeUsers: ["@feature_friend"],
            },
        );
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === updateCallId)?.status !== "pending",
            "new channel membership update",
        );
        expect(completedOutput(updateCallId, rig)).toMatchObject({
            chatId: agentChatId,
            addedUserIds: [reviewer.id],
            removedUserIds: [friend.id],
        });
        expect((await server.as(friend).get(`/v0/chats/${agentChatId}`)).statusCode).toBe(404);
        expect((await server.as(reviewer).get(`/v0/chats/${agentChatId}`)).statusCode).toBe(200);
        expect((await server.as(friend).get(`/v0/chats/${childChat.id}`)).statusCode).toBe(404);
        expect((await server.as(reviewer).get(`/v0/chats/${childChat.id}`)).statusCode).toBe(404);
        expect((await server.as(reviewer).post(`/v0/chats/${childChat.id}/join`)).statusCode).toBe(
            200,
        );

        const peopleMessageCallId = rig.requestExternalToolCall(
            channelRun.runId,
            channelMessageTool.name,
            {
                audience: "people",
                text: "Automated progress update without another inference turn.",
            },
        );
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === peopleMessageCallId)?.status !==
                "pending",
            "people-only automated message",
        );
        expect(completedOutput(peopleMessageCallId, rig)).toMatchObject({
            message: {
                chatId: agentChatId,
                sender: { id: owner.id },
                automated: true,
                audience: "people",
                text: "Automated progress update without another inference turn.",
            },
        });
        expect(rig.submittedRuns).toHaveLength(2);

        const agentMessageCallId = rig.requestExternalToolCall(
            channelRun.runId,
            channelMessageTool.name,
            {
                audience: "agents",
                text: "Automated follow-up that starts another inference turn.",
            },
        );
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === agentMessageCallId)?.status !==
                "pending",
            "agent-addressed automated message",
        );
        expect(completedOutput(agentMessageCallId, rig)).toMatchObject({
            message: {
                chatId: agentChatId,
                sender: { id: owner.id },
                automated: true,
                audience: "agents",
                text: "Automated follow-up that starts another inference turn.",
            },
        });
        rig.completeRun(channelRun.runId, "Finished the channel-management turn.");
        await waitFor(() => rig.submittedRuns.length === 3, "automated follow-up inference turn");
    }, 30_000);
});

type ChatCall = {
    name: string;
    arguments: Record<string, unknown>;
    _meta?: Record<string, unknown>;
};

class ChatManagementRuntime implements PluginMcpRuntime {
    readonly calls: ChatCall[] = [];
    private readonly containers = new Map<
        string,
        { installationId: string; containerInstanceId: string }
    >();
    private readonly runtimeTokens = new Map<string, string>();
    update?: (input: {
        runtimeToken: string;
        chatToken: string;
        input: Record<string, unknown>;
    }) => Promise<{ statusCode: number; body: Record<string, unknown> }>;
    action?: (input: {
        runtimeToken: string;
        chatToken: string;
        call: ChatCall;
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
        const installationId = input.containerName.replace(/^happy2-plugin-/, "");
        const runtimeToken = input.environment.HAPPY2_PLUGIN_API_TOKEN;
        if (!runtimeToken) throw new Error("Plugin runtime token was not supplied");
        this.runtimeTokens.set(installationId, runtimeToken);
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
                        serverInfo: { name: "chat-management-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = {
                        tools: [
                            {
                                name: "chat_update",
                                title: "Update current chat",
                                description:
                                    "Changes the title or description of the current chat.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: ["string", "null"] },
                                    },
                                    additionalProperties: false,
                                },
                            },
                            {
                                name: "message_send",
                                title: "Send a message",
                                description:
                                    "Posts an automated message to the current chat with explicit inference.",
                                inputSchema: { type: "object", additionalProperties: false },
                            },
                            {
                                name: "channel_members_update",
                                title: "Add or remove channel members",
                                description: "Adds or removes users from the current channel.",
                                inputSchema: { type: "object", additionalProperties: false },
                            },
                            {
                                name: "channel_create",
                                title: "Create a channel",
                                description: "Creates a channel with an optional initial message.",
                                inputSchema: { type: "object", additionalProperties: false },
                            },
                            {
                                name: "project_create",
                                title: "Create a project",
                                description: "Creates a project with initial channels.",
                                inputSchema: { type: "object", additionalProperties: false },
                            },
                            {
                                name: "channel_child_create",
                                title: "Create a child channel",
                                description: "Creates a child channel under the current channel.",
                                inputSchema: { type: "object", additionalProperties: false },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const call = structuredClone(message.params) as ChatCall;
                    this.calls.push(call);
                    const response =
                        call.name === "chat_update"
                            ? await this.update?.({
                                  runtimeToken,
                                  chatToken: chatMeta(call).token,
                                  input: call.arguments,
                              })
                            : await this.action?.({
                                  runtimeToken,
                                  chatToken: chatMeta(call).token,
                                  call,
                              });
                    if (!response) throw new Error("Plugin host callback is unavailable");
                    result =
                        response.statusCode >= 200 && response.statusCode < 300
                            ? {
                                  content: [
                                      {
                                          type: "text",
                                          text: "Chat Management action completed.",
                                      },
                                  ],
                                  structuredContent: response.body,
                              }
                            : {
                                  isError: true,
                                  content: [
                                      {
                                          type: "text",
                                          text: String(response.body.message ?? "Update failed"),
                                      },
                                  ],
                              };
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

    tokenFor(installationId: string): string {
        const token = this.runtimeTokens.get(installationId);
        if (!token) throw new Error(`No runtime token was captured for ${installationId}`);
        return token;
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

function chatMeta(call: ChatCall): { id: string; token: string } {
    const value = call._meta?.["happy2/chat"];
    if (!value || typeof value !== "object") throw new Error("Chat metadata was not supplied");
    const meta = value as { id?: unknown; token?: unknown };
    if (typeof meta.id !== "string" || typeof meta.token !== "string")
        throw new Error("Chat metadata was malformed");
    return { id: meta.id, token: meta.token };
}

type ReferencedUser = {
    id: string;
    username: string;
    token: string;
    triggeredTurn: boolean;
};

function referencedUsers(call: ChatCall): ReferencedUser[] {
    const value = call._meta?.["happy2/users"];
    if (!Array.isArray(value)) throw new Error("Referenced-user metadata was not supplied");
    return value as ReferencedUser[];
}

function selectCapabilities(value: unknown, users: ReferencedUser[]) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error("User selectors must be an array");
    return value.map((selector) => {
        if (typeof selector !== "string") throw new Error("User selector must be a string");
        const normalized = selector.replace(/^@/, "").toLowerCase();
        const user = users.find(({ id, username }) => id === selector || username === normalized);
        if (!user) throw new Error(`Referenced user ${selector} was not found`);
        return { id: user.id, token: user.token };
    });
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

async function install(client: GymRequestClient): Promise<string> {
    const installed = await client.post("/v0/admin/plugins/chat-management/installPlugin", {
        permissions: [
            "projects:create",
            "channels:create",
            "channels:create-child",
            "chats:members:add",
            "chats:members:remove",
            "chats:update",
            "messages:send",
        ],
    });
    expect(installed.statusCode).toBe(202);
    const installationId = installed.json().installation.id as string;
    await waitFor(async () => {
        const catalog = await client.get("/v0/admin/plugins");
        const body = catalog.json();
        if (!Array.isArray(body.plugins))
            throw new Error(
                `Plugin catalog failed (${catalog.statusCode}): ${JSON.stringify(body)}`,
            );
        return body.plugins
            .flatMap(
                (plugin: {
                    systemPlugin?: { installations?: Array<{ id: string; status: string }> };
                }) => plugin.systemPlugin?.installations ?? [],
            )
            .some(
                (installation: { id: string; status: string }) =>
                    installation.id === installationId && installation.status === "ready",
            );
    }, `plugin installation ${installationId}`);
    return installationId;
}

async function createAgent(client: GymRequestClient): Promise<string> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready") {
        expect(
            (await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        await waitFor(async () => {
            catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
            return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
        }, "agent image build");
    }
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
    const created = await client.post("/v0/chats/createAgent", {
        name: "Release agent",
        username: "release_agent",
    });
    expect(created.statusCode).toBe(201);
    return created.json().chat.id as string;
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
