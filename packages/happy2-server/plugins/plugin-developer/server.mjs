import { createInterface } from "node:readline";

async function handle(request) {
    if (request.method === "initialize") {
        return {
            result: {
                protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "happy2-plugin-developer", version: "1.0.0" },
            },
        };
    }
    if (request.method === "ping") return { result: {} };
    if (request.method === "tools/list") return { result: { tools } };
    if (request.method === "tools/call") return callTool(request.params);
    return { error: { code: -32601, message: `Method not found: ${String(request.method)}` } };
}

const tools = [
    {
        name: "happy2_plugins_list",
        title: "List installed Happy2 plugins",
        description:
            "Lists installed Happy2 plugin identities, versions, installation IDs, and health.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
        name: "happy2_plugin_install_from_link",
        title: "Request Happy2 plugin installation",
        description:
            "Downloads and validates a Happy2 plugin ZIP link, then posts a human approval request in the current chat. It never installs without approval.",
        inputSchema: {
            type: "object",
            properties: {
                sourceUrl: {
                    type: "string",
                    description: "Public HTTPS URL of a Happy2 plugin ZIP package.",
                },
                reason: {
                    type: "string",
                    description: "Short explanation of why this chat needs the plugin.",
                },
            },
            required: ["sourceUrl"],
            additionalProperties: false,
        },
    },
    {
        name: "happy2_plugin_uninstall",
        title: "Request Happy2 plugin uninstall",
        description:
            "Posts a human approval request in the current chat to uninstall one Happy2 plugin installation. It never uninstalls without approval.",
        inputSchema: {
            type: "object",
            properties: {
                installationId: {
                    type: "string",
                    description: "Installation ID returned by happy2_plugins_list.",
                },
                reason: {
                    type: "string",
                    description: "Short explanation of why this installation should be removed.",
                },
            },
            required: ["installationId"],
            additionalProperties: false,
        },
    },
];

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
                { type: "text", text: error instanceof Error ? error.message : String(error) },
            ],
        },
    }));
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, ...response })}\n`);
}

async function callTool(params) {
    if (params?.name === "happy2_plugins_list") {
        const result = await hostRequest("GET", "/plugins");
        return textResult(JSON.stringify(result, null, 2));
    }
    if (params?.name === "happy2_plugin_install_from_link") {
        const sourceUrl = text(params.arguments?.sourceUrl, "sourceUrl", 4_096);
        const reason = optionalText(params.arguments?.reason, "reason", 1_000);
        const result = await hostRequest("POST", "/plugin-install-requests", {
            sourceUrl,
            ...(reason ? { reason } : {}),
        });
        return textResult(
            `Happy2 posted an installation approval in this chat. Request: ${JSON.stringify(result.approval)}`,
        );
    }
    if (params?.name === "happy2_plugin_uninstall") {
        const installationId = text(params.arguments?.installationId, "installationId", 128);
        const reason = optionalText(params.arguments?.reason, "reason", 1_000);
        const result = await hostRequest("POST", "/plugin-uninstall-requests", {
            installationId,
            ...(reason ? { reason } : {}),
        });
        return textResult(
            `Happy2 posted an uninstall approval in this chat. Request: ${JSON.stringify(result.approval)}`,
        );
    }
    return { result: { isError: true, content: [{ type: "text", text: "Unknown tool" }] } };
}

async function hostRequest(method, path, body) {
    const base = process.env.HAPPY2_PLUGIN_API_URL;
    const token = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!base || !token) throw new Error("Happy2 plugin host API is unavailable");
    const response = await fetch(new URL(path, base), {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => undefined);
    if (!response.ok)
        throw new Error(
            result?.message ?? `Happy2 plugin host API returned HTTP ${response.status}`,
        );
    return result;
}

function textResult(text) {
    return { result: { content: [{ type: "text", text }] } };
}

function text(value, name, maximum) {
    if (typeof value !== "string" || !value.trim() || value.length > maximum)
        throw new Error(`${name} must contain between 1 and ${maximum} characters`);
    return value.trim();
}

function optionalText(value, name, maximum) {
    return value === undefined ? undefined : text(value, name, maximum);
}
