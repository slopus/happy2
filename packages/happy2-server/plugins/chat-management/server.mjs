import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const CHAT_META_KEY = "happy2/chat";
const USERS_META_KEY = "happy2/users";
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
        request = JSON.parse(line);
    } catch {
        continue;
    }
    if (request.id === undefined) continue;
    const response = await handle(request).catch((error) => ({
        result: {
            isError: true,
            content: [
                {
                    type: "text",
                    text: error instanceof Error ? error.message : "The chat could not be updated.",
                },
            ],
        },
    }));
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, ...response })}\n`);
}

async function handle(request) {
    if (request.method === "initialize") {
        return {
            result: {
                protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "happy2-chat-management", version: "1.1.0" },
            },
        };
    }
    if (request.method === "ping") return { result: {} };
    if (request.method === "tools/list") {
        return {
            result: {
                tools: [
                    {
                        name: "chat_update",
                        title: "Update current chat",
                        description:
                            "Changes the title or description of the current chat. Omit a field to leave it unchanged; pass null or an empty string to clear the description.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                title: {
                                    type: "string",
                                    minLength: 1,
                                    maxLength: 100,
                                    description: "The new title for the current chat.",
                                },
                                description: {
                                    type: ["string", "null"],
                                    maxLength: 500,
                                    description:
                                        "The new description, or null to clear the current description.",
                                },
                            },
                            anyOf: [{ required: ["title"] }, { required: ["description"] }],
                            additionalProperties: false,
                        },
                    },
                    {
                        name: "channel_members_update",
                        title: "Add or remove channel members",
                        description:
                            "Adds or removes users from the current channel. This never changes direct-message membership. Identify users by the @username shown in the triggering conversation; only users supplied in Happy's signed metadata are available.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                addUsers: {
                                    type: "array",
                                    maxItems: 100,
                                    uniqueItems: true,
                                    items: { type: "string", minLength: 1 },
                                    description: "Usernames (with or without @) to add.",
                                },
                                removeUsers: {
                                    type: "array",
                                    maxItems: 100,
                                    uniqueItems: true,
                                    items: { type: "string", minLength: 1 },
                                    description: "Usernames (with or without @) to remove.",
                                },
                            },
                            anyOf: [{ required: ["addUsers"] }, { required: ["removeUsers"] }],
                            additionalProperties: false,
                        },
                    },
                    {
                        name: "channel_create",
                        title: "Create a channel",
                        description:
                            "Creates a private channel owned by the user who triggered this turn, adds selected referenced users, and optionally posts an initial message. An agents message starts the current agent working; a people message only shares context and does not trigger inference.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    minLength: 1,
                                    maxLength: 100,
                                    description: "Channel title.",
                                },
                                description: {
                                    type: "string",
                                    minLength: 1,
                                    maxLength: 500,
                                    description: "Optional channel description.",
                                },
                                members: {
                                    type: "array",
                                    maxItems: 100,
                                    uniqueItems: true,
                                    items: { type: "string", minLength: 1 },
                                    description:
                                        "Referenced usernames (with or without @) to add. The triggering user is already the owner.",
                                },
                                initialMessage: {
                                    type: "object",
                                    properties: {
                                        text: {
                                            type: "string",
                                            minLength: 1,
                                            maxLength: 40000,
                                            description:
                                                "A copied or rephrased opening prompt or informational message.",
                                        },
                                        audience: {
                                            type: "string",
                                            enum: ["agents", "people"],
                                            description:
                                                "agents starts the current agent; people posts without inference.",
                                        },
                                    },
                                    required: ["text", "audience"],
                                    additionalProperties: false,
                                },
                            },
                            required: ["name"],
                            additionalProperties: false,
                        },
                    },
                ],
            },
        };
    }
    if (request.method === "tools/call" && request.params?.name === "chat_update")
        return { result: await updateChat(request.params) };
    if (request.method === "tools/call" && request.params?.name === "channel_members_update")
        return { result: await updateChannelMembers(request.params) };
    if (request.method === "tools/call" && request.params?.name === "channel_create")
        return { result: await createChannel(request.params) };
    return {
        error: { code: -32601, message: `Method not found: ${String(request.method)}` },
    };
}

async function updateChat(params) {
    const { chat } = capabilityContext(params);
    const input = params.arguments;
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("A chat update is required.");
    const result = await callHost("/chats/updateChat", chat.token, input);
    return {
        content: [
            {
                type: "text",
                text: `Updated chat ${result.chat.id}.`,
            },
        ],
        structuredContent: { chat: result.chat },
    };
}

async function updateChannelMembers(params) {
    const { chat, users } = capabilityContext(params);
    const input = params.arguments;
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("A channel membership update is required.");
    const add = resolveUsers(input.addUsers ?? [], users, "addUsers");
    const remove = resolveUsers(input.removeUsers ?? [], users, "removeUsers");
    if (!add.length && !remove.length)
        throw new Error("At least one user must be added or removed.");
    const result = await callHost("/channels/updateMembers", chat.token, { add, remove });
    return {
        content: [
            {
                type: "text",
                text: `Updated members of channel ${result.chatId}: added ${result.addedUserIds.length}, removed ${result.removedUserIds.length}.`,
            },
        ],
        structuredContent: result,
    };
}

async function createChannel(params) {
    const { chat, users } = capabilityContext(params);
    const input = params.arguments;
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("A channel definition is required.");
    const members = resolveUsers(input.members ?? [], users, "members");
    const result = await callHost("/channels/createChannel", chat.token, {
        ...input,
        members,
        idempotencyKey: randomUUID(),
    });
    return {
        content: [
            {
                type: "text",
                text: `Created channel ${result.chat.id}${result.initialMessage ? " and posted its initial message" : ""}.`,
            },
        ],
        structuredContent: result,
    };
}

function capabilityContext(params) {
    const chat = params?._meta?.[CHAT_META_KEY];
    if (!chat || typeof chat.id !== "string" || typeof chat.token !== "string")
        throw new Error("This tool must be called from an active Happy chat.");
    const users = params?._meta?.[USERS_META_KEY];
    if (!Array.isArray(users)) throw new Error("Happy did not provide referenced-user metadata.");
    return { chat, users };
}

function resolveUsers(selectors, users, name) {
    if (!Array.isArray(selectors)) throw new Error(`${name} must be an array.`);
    const resolved = selectors.map((selector) => {
        if (typeof selector !== "string" || !selector.trim())
            throw new Error(`${name} must contain usernames.`);
        const normalized = selector.trim().replace(/^@/, "").toLowerCase();
        const matches = users.filter(
            (user) =>
                user &&
                typeof user === "object" &&
                (user.id === selector.trim() ||
                    (typeof user.username === "string" &&
                        user.username.toLowerCase() === normalized)),
        );
        if (matches.length !== 1)
            throw new Error(`User ${selector} is not uniquely available in this turn.`);
        const user = matches[0];
        if (typeof user.id !== "string" || typeof user.token !== "string")
            throw new Error(`User ${selector} has malformed capability metadata.`);
        return { id: user.id, token: user.token };
    });
    if (new Set(resolved.map(({ id }) => id)).size !== resolved.length)
        throw new Error(`${name} contains a duplicate user.`);
    return resolved;
}

async function callHost(path, chatToken, body) {
    const apiUrl = process.env.HAPPY2_PLUGIN_API_URL;
    const runtimeToken = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!apiUrl || !runtimeToken) throw new Error("The Happy Plugin API is unavailable.");
    const response = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${runtimeToken}`,
            "content-type": "application/json",
            "x-happy2-chat-token": chatToken,
        },
        body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => undefined);
    if (!response.ok)
        throw new Error(
            typeof result?.message === "string" ? result.message : "The chat action failed.",
        );
    return result;
}
