import { createInterface } from "node:readline";

const CHAT_META_KEY = "happy2/chat";
const DEFAULT_PREVIEW_BYTES = 4096;
const MAX_PREVIEW_BYTES = 16384;
const REQUEST_TIMEOUT_MS = 10_000;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
        request = JSON.parse(line);
    } catch {
        continue;
    }
    if (!request || typeof request !== "object" || Array.isArray(request)) continue;
    if (request.id === undefined) continue;
    const response = await handle(request).catch((error) => ({
        result: {
            isError: true,
            content: [
                {
                    type: "text",
                    text:
                        error instanceof Error
                            ? error.message
                            : "The port-sharing operation failed.",
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
                serverInfo: { name: "happy2-port-sharing", version: "1.1.0" },
            },
        };
    }
    if (request.method === "ping") return { result: {} };
    if (request.method === "tools/list") return { result: { tools: toolDefinitions() } };
    if (request.method !== "tools/call")
        return {
            error: { code: -32601, message: `Method not found: ${String(request.method)}` },
        };
    const input = request.params?.arguments ?? {};
    switch (request.params?.name) {
        case "happy2_port_shares_list":
            return { result: await listPortShares(request.params) };
        case "happy2_port_share_expose":
            return { result: await exposePort(request.params, input) };
        case "happy2_port_share_disable":
            return { result: await disablePortShare(request.params, input) };
        case "happy2_port_share_create_access_token":
            return { result: await createAccessToken(request.params, input) };
        case "happy2_port_share_probe":
            return { result: await probePortShare(request.params, input) };
        default:
            return {
                error: {
                    code: -32601,
                    message: `Tool not found: ${String(request.params?.name)}`,
                },
            };
    }
}

function toolDefinitions() {
    const portShareId = {
        type: "string",
        minLength: 1,
        maxLength: 128,
        description: "The exact share ID returned by the list or expose tool.",
    };
    return [
        {
            name: "happy2_port_shares_list",
            title: "List shared ports",
            description:
                "Lists active port shares and their internet, server, or chat audience for the current Happy chat. Use this before exposing or disabling a port because only one share may be active per chat.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
        {
            name: "happy2_port_share_expose",
            title: "Expose a container port",
            description:
                "Creates a shared hostname for one web server already listening on port 3000 through 3010 in the current chat agent container. Internet shares are directly reachable by the model; server and chat shares require Happy user authentication, though the probe tool can access them for verification.",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        minLength: 1,
                        maxLength: 80,
                        description:
                            "Friendly display name used to form the public hostname, such as Documentation Preview.",
                    },
                    port: {
                        type: "integer",
                        minimum: 3000,
                        maximum: 3010,
                        description: "Container port on which the web server is listening.",
                    },
                    audience: {
                        type: "string",
                        enum: ["internet", "server", "chat"],
                        description:
                            "Who can open the share: internet allows anyone, server allows any authenticated Happy user, and chat allows only current members of this chat.",
                    },
                },
                required: ["name", "port", "audience"],
                additionalProperties: false,
            },
        },
        {
            name: "happy2_port_share_disable",
            title: "Stop sharing a port",
            description:
                "Disables one exact active port share in the current chat. The hostname and all previously issued access tokens stop working.",
            inputSchema: {
                type: "object",
                properties: { portShareId },
                required: ["portShareId"],
                additionalProperties: false,
            },
        },
        {
            name: "happy2_port_share_create_access_token",
            title: "Create a port-share access token",
            description:
                "Issues a one-hour bearer token bound to the triggering user and selected subdomain. Use only when a custom HTTP client needs direct access; prefer the probe tool for routine checks and never reveal the token in chat.",
            inputSchema: {
                type: "object",
                properties: { portShareId },
                required: ["portShareId"],
                additionalProperties: false,
            },
        },
        {
            name: "happy2_port_share_probe",
            title: "Verify a shared endpoint",
            description:
                "Issues a fresh scoped token internally, sends an authenticated GET or HEAD to the selected public share, and returns a bounded response preview without returning the token.",
            inputSchema: {
                type: "object",
                properties: {
                    portShareId,
                    path: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2048,
                        default: "/",
                        description:
                            "Origin-relative path to verify. It must begin with one slash and cannot select another host.",
                    },
                    method: {
                        type: "string",
                        enum: ["GET", "HEAD"],
                        default: "GET",
                        description: "HTTP method used for the verification request.",
                    },
                    maxBytes: {
                        type: "integer",
                        minimum: 128,
                        maximum: MAX_PREVIEW_BYTES,
                        default: DEFAULT_PREVIEW_BYTES,
                        description: "Maximum response-body bytes returned to the agent.",
                    },
                },
                required: ["portShareId"],
                additionalProperties: false,
            },
        },
    ];
}

async function listPortShares(params) {
    const { token } = capabilityContext(params);
    const result = await callHost("/port-shares", token);
    return toolResult(
        `Found ${result.portShares.length} active port share${result.portShares.length === 1 ? "" : "s"} in this chat.`,
        result,
    );
}

async function exposePort(params, input) {
    const { token } = capabilityContext(params);
    const name = requiredString(input, "name", 80);
    const port = requiredInteger(input, "port", 3000, 3010);
    const audience = optionalEnum(input, "audience", ["internet", "server", "chat"]);
    if (!audience) throw new Error("audience is required.");
    const result = await callHost("/port-shares/exposePort", token, {
        method: "POST",
        body: { name, port, audience },
    });
    return toolResult(
        `Shared ${name} on container port ${port} with ${audience} access at ${result.portShare.url}.`,
        result,
    );
}

async function disablePortShare(params, input) {
    const { token } = capabilityContext(params);
    const portShareId = requiredString(input, "portShareId", 128);
    const result = await callHost(
        `/port-shares/${encodeURIComponent(portShareId)}/disablePortShare`,
        token,
        { method: "POST", body: {} },
    );
    return toolResult(`Stopped sharing ${result.portShare.name}.`, result);
}

async function createAccessToken(params, input) {
    const { token } = capabilityContext(params);
    const portShareId = requiredString(input, "portShareId", 128);
    const result = await issueAccessToken(token, portShareId);
    return toolResult(
        `Issued a one-hour access token for ${result.portShare.name}. Keep it secret and request a fresh token after ${result.refreshAfter}.`,
        result,
    );
}

async function probePortShare(params, input) {
    const { token } = capabilityContext(params);
    const portShareId = requiredString(input, "portShareId", 128);
    const path = optionalString(input, "path", 2048) ?? "/";
    if (!path.startsWith("/") || path.startsWith("//"))
        throw new Error("path must be origin-relative and begin with exactly one slash.");
    const method = optionalEnum(input, "method", ["GET", "HEAD"]) ?? "GET";
    const maxBytes =
        optionalInteger(input, "maxBytes", 128, MAX_PREVIEW_BYTES) ?? DEFAULT_PREVIEW_BYTES;
    const access = await issueAccessToken(token, portShareId);
    const base = new URL(access.portShare.url);
    const target = new URL(path, base);
    if (target.origin !== base.origin)
        throw new Error("path must stay on the selected port-share origin.");
    const response = await fetch(target, {
        method,
        headers: { "x-happy2-port-share-authorization": `Bearer ${access.token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const preview =
        method === "HEAD"
            ? { bodyPreview: "", truncated: false }
            : await responsePreview(response, maxBytes);
    const result = {
        portShare: access.portShare,
        request: { method, path: `${target.pathname}${target.search}` },
        response: {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get("content-type") ?? undefined,
            contentLength: response.headers.get("content-length") ?? undefined,
            location: response.headers.get("location") ?? undefined,
            ...preview,
        },
    };
    return toolResult(
        `${method} ${result.request.path} returned HTTP ${response.status}${preview.truncated ? `; body preview was capped at ${maxBytes} bytes` : ""}.`,
        result,
    );
}

async function issueAccessToken(chatToken, portShareId) {
    return callHost(
        `/port-shares/${encodeURIComponent(portShareId)}/createAccessToken`,
        chatToken,
        { method: "POST", body: {} },
    );
}

function capabilityContext(params) {
    const chat = params?._meta?.[CHAT_META_KEY];
    if (!chat || typeof chat.id !== "string" || typeof chat.token !== "string")
        throw new Error("This tool must be called from an active Happy chat.");
    return chat;
}

function requiredString(input, name, maximum) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Tool arguments must be an object.");
    const value = input[name];
    if (typeof value !== "string" || !value.trim() || value.length > maximum)
        throw new Error(`${name} must contain between 1 and ${maximum} characters.`);
    return value.trim();
}

function optionalString(input, name, maximum) {
    const value = input?.[name];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !value || value.length > maximum)
        throw new Error(`${name} must contain between 1 and ${maximum} characters.`);
    return value;
}

function requiredInteger(input, name, minimum, maximum) {
    const value = input?.[name];
    if (!Number.isInteger(value) || value < minimum || value > maximum)
        throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
    return value;
}

function optionalInteger(input, name, minimum, maximum) {
    if (input?.[name] === undefined) return undefined;
    return requiredInteger(input, name, minimum, maximum);
}

function optionalEnum(input, name, values) {
    const value = input?.[name];
    if (value === undefined) return undefined;
    if (!values.includes(value)) throw new Error(`${name} must be one of ${values.join(", ")}.`);
    return value;
}

function toolResult(text, structuredContent) {
    return { content: [{ type: "text", text }], structuredContent };
}

async function callHost(path, chatToken, options = {}) {
    const apiUrl = process.env.HAPPY2_PLUGIN_API_URL;
    const runtimeToken = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!apiUrl || !runtimeToken) throw new Error("The Happy Plugin API is unavailable.");
    const response = await fetch(new URL(path, `${apiUrl}/`), {
        method: options.method ?? "GET",
        headers: {
            authorization: `Bearer ${runtimeToken}`,
            "x-happy2-chat-token": chatToken,
            ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const result = await response.json().catch(() => undefined);
    if (!response.ok)
        throw new Error(
            typeof result?.message === "string"
                ? result.message
                : `Happy port-sharing API returned HTTP ${response.status}.`,
        );
    return result;
}

async function responsePreview(response, maximum) {
    if (!response.body) return { bodyPreview: "", truncated: false };
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    let truncated = false;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const remaining = maximum - length;
            if (value.byteLength > remaining) {
                if (remaining > 0) chunks.push(value.subarray(0, remaining));
                length = maximum;
                truncated = true;
                await reader.cancel();
                break;
            }
            chunks.push(value);
            length += value.byteLength;
            if (length === maximum) {
                const next = await reader.read();
                truncated = !next.done;
                if (!next.done) await reader.cancel();
                break;
            }
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { bodyPreview: new TextDecoder().decode(bytes), truncated };
}
