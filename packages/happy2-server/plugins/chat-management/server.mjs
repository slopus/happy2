import { createInterface } from "node:readline";

const CHAT_META_KEY = "happy2/chat";
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
                serverInfo: { name: "happy2-chat-management", version: "1.0.0" },
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
                ],
            },
        };
    }
    if (request.method === "tools/call" && request.params?.name === "chat_update")
        return { result: await updateChat(request.params) };
    return {
        error: { code: -32601, message: `Method not found: ${String(request.method)}` },
    };
}

async function updateChat(params) {
    const chat = params?._meta?.[CHAT_META_KEY];
    if (!chat || typeof chat.id !== "string" || typeof chat.token !== "string")
        throw new Error("This tool must be called from an active Happy chat.");
    const apiUrl = process.env.HAPPY2_PLUGIN_API_URL;
    const runtimeToken = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!apiUrl || !runtimeToken) throw new Error("The Happy Plugin API is unavailable.");
    const input = params.arguments;
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("A chat update is required.");
    const response = await fetch(`${apiUrl}/chats/updateChat`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${runtimeToken}`,
            "content-type": "application/json",
            "x-happy2-chat-token": chat.token,
        },
        body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => undefined);
    if (!response.ok)
        throw new Error(
            typeof result?.message === "string" ? result.message : "The chat could not be updated.",
        );
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
