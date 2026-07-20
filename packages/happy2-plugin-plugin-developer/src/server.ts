import {
    McpServer,
    startPluginServer,
    type CallToolResult,
    type JsonObject,
} from "happy2-plugin-sdk/server";
import { z } from "zod/v4";

const server = new McpServer({ name: "happy2-plugin-developer", version: "1.0.0" });

server.registerTool(
    "happy2_plugins_list",
    {
        title: "List installed Happy2 plugins",
        description:
            "Lists installed Happy2 plugin identities, versions, installation IDs, and health.",
        inputSchema: z.strictObject({}),
    },
    () =>
        safeTool(async () => {
            const result = await hostRequest("GET", "/plugins");
            return textResult(JSON.stringify(result, null, 2));
        }),
);

server.registerTool(
    "happy2_plugin_install_from_link",
    {
        title: "Request Happy2 plugin installation",
        description:
            "Downloads and validates a Happy2 plugin ZIP link, then posts a human approval request in the current chat. It never installs without approval.",
        inputSchema: z.strictObject({
            sourceUrl: z.string().describe("Public HTTPS URL of a Happy2 plugin ZIP package."),
            reason: z
                .string()
                .optional()
                .describe("Short explanation of why this chat needs the plugin."),
        }),
    },
    (input) =>
        safeTool(async () => {
            const sourceUrl = text(input.sourceUrl, "sourceUrl", 4_096);
            const reason = optionalText(input.reason, "reason", 1_000);
            const result = await hostRequest("POST", "/plugin-install-requests", {
                sourceUrl,
                ...(reason ? { reason } : {}),
            });
            return textResult(
                `Happy2 posted an installation approval in this chat. Request: ${JSON.stringify(result.approval)}`,
            );
        }),
);

server.registerTool(
    "happy2_plugin_uninstall",
    {
        title: "Request Happy2 plugin uninstall",
        description:
            "Posts a human approval request in the current chat to uninstall one Happy2 plugin installation. It never uninstalls without approval.",
        inputSchema: z.strictObject({
            installationId: z.string().describe("Installation ID returned by happy2_plugins_list."),
            reason: z
                .string()
                .optional()
                .describe("Short explanation of why this installation should be removed."),
        }),
    },
    (input) =>
        safeTool(async () => {
            const installationId = text(input.installationId, "installationId", 128);
            const reason = optionalText(input.reason, "reason", 1_000);
            const result = await hostRequest("POST", "/plugin-uninstall-requests", {
                installationId,
                ...(reason ? { reason } : {}),
            });
            return textResult(
                `Happy2 posted an uninstall approval in this chat. Request: ${JSON.stringify(result.approval)}`,
            );
        }),
);

async function hostRequest(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
): Promise<JsonObject> {
    const base = process.env.HAPPY2_PLUGIN_API_URL;
    const token = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!base || !token) throw new Error("Happy2 plugin host API is unavailable");
    const response = await fetch(new URL(path.replace(/^\//, ""), trailingSlash(base)), {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result: unknown = await response.json().catch(() => undefined);
    if (!response.ok)
        throw new Error(
            responseMessage(result) ?? `Happy2 plugin host API returned HTTP ${response.status}`,
        );
    if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("Happy2 plugin host API returned an invalid response");
    return result as JsonObject;
}

function textResult(text: string): CallToolResult {
    return { content: [{ type: "text", text }] };
}

async function safeTool(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await work();
    } catch (error) {
        return {
            isError: true,
            content: [
                { type: "text", text: error instanceof Error ? error.message : String(error) },
            ],
        };
    }
}

function trailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function responseMessage(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const candidate = (value as Record<string, unknown>).message;
    return typeof candidate === "string" ? candidate : undefined;
}

function text(value: string, name: string, maximum: number): string {
    if (!value.trim() || value.length > maximum)
        throw new Error(`${name} must contain between 1 and ${maximum} characters`);
    return value.trim();
}

function optionalText(
    value: string | undefined,
    name: string,
    maximum: number,
): string | undefined {
    return value === undefined ? undefined : text(value, name, maximum);
}

await startPluginServer(server);
