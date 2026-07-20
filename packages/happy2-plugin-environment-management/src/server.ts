import { McpServer, startPluginServer, type CallToolResult } from "happy2-plugin-sdk/server";
import { z } from "zod";

type JsonRecord = Record<string, unknown>;

const server = new McpServer({
    name: "happy2-environment-management",
    version: "1.0.0",
});
const environmentId = z
    .string()
    .min(1)
    .max(128)
    .describe("The environment ID returned by happy2_environments_list or creation.");

server.registerTool(
    "happy2_environments_list",
    {
        description:
            "Lists active and inactive Happy agent environments, their build status, and the current default environment.",
        inputSchema: z.object({}).strict(),
        title: "List agent environments",
    },
    () => safely(listEnvironments),
);

server.registerTool(
    "happy2_environment_get_dockerfile",
    {
        description:
            "Returns the retained immutable Dockerfile and active state for one Happy agent environment.",
        inputSchema: z.object({ environmentId }).strict(),
        title: "Read an environment Dockerfile",
    },
    ({ environmentId: id }) => safely(() => getDockerfile(id)),
);

server.registerTool(
    "happy2_environment_create",
    {
        description:
            "Creates an immutable Happy agent environment and queues its Docker image build. The exact definition of an inactive environment is reactivated under the same ID and rebuilt. Creation returns before the build is ready.",
        inputSchema: z
            .object({
                dockerfile: z
                    .string()
                    .min(1)
                    .max(262_144)
                    .describe("The complete Dockerfile used to build the environment."),
                name: z
                    .string()
                    .min(1)
                    .max(100)
                    .describe("A concise human-readable environment name."),
            })
            .strict(),
        title: "Create or reactivate an agent environment",
    },
    ({ dockerfile, name }) => safely(() => createEnvironment(name, dockerfile)),
);

server.registerTool(
    "happy2_environment_set_default",
    {
        description:
            "Selects a ready environment as the default for agents created in the future. Existing agents keep their assigned environment.",
        inputSchema: z.object({ environmentId }).strict(),
        title: "Set the default agent environment",
    },
    ({ environmentId: id }) => safely(() => setDefaultEnvironment(id)),
);

server.registerTool(
    "happy2_environment_deactivate",
    {
        description:
            "Deactivates a custom environment only when it is unused. Happy permanently retains its manifest and Dockerfile so the same definition can be reactivated and rebuilt later.",
        inputSchema: z.object({ environmentId }).strict(),
        title: "Deactivate an unused agent environment",
    },
    ({ environmentId: id }) => safely(() => deactivateEnvironment(id)),
);

await startPluginServer(server);

async function listEnvironments(): Promise<CallToolResult> {
    const result = await callHost("/environments");
    const environments = array(result.environments, "Happy environment list");
    return toolResult(
        `Found ${environments.length} agent environment${environments.length === 1 ? "" : "s"}.`,
        result,
    );
}

async function getDockerfile(input: string): Promise<CallToolResult> {
    const id = requiredString(input, "environmentId");
    const result = await callHost(`/environments/${encodeURIComponent(id)}/dockerfile`);
    const environment = record(result.environment, "Happy environment");
    return toolResult(
        `Read the Dockerfile for ${requiredString(environment.name, "name")}.`,
        result,
    );
}

async function createEnvironment(
    inputName: string,
    inputDockerfile: string,
): Promise<CallToolResult> {
    const name = requiredString(inputName, "name");
    const dockerfile = requiredString(inputDockerfile, "dockerfile", false);
    const result = await callHost("/environments/createEnvironment", {
        body: { dockerfile, name },
        method: "POST",
    });
    const environment = record(result.environment, "Happy environment");
    return toolResult(
        `Environment ${requiredString(environment.name, "name")} is active; its image build is ${requiredString(environment.status, "status")}.`,
        result,
    );
}

async function setDefaultEnvironment(input: string): Promise<CallToolResult> {
    const id = requiredString(input, "environmentId");
    const result = await callHost(`/environments/${encodeURIComponent(id)}/setDefaultEnvironment`, {
        body: {},
        method: "POST",
    });
    const environment = record(result.environment, "Happy environment");
    return toolResult(
        `Set ${requiredString(environment.name, "name")} as the default environment.`,
        result,
    );
}

async function deactivateEnvironment(input: string): Promise<CallToolResult> {
    const id = requiredString(input, "environmentId");
    const result = await callHost(`/environments/${encodeURIComponent(id)}/deactivateEnvironment`, {
        body: {},
        method: "POST",
    });
    return toolResult(
        `Deactivated environment ${requiredString(result.environmentId, "environmentId")}.`,
        result,
    );
}

async function safely(operation: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await operation();
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text:
                        error instanceof Error
                            ? error.message
                            : "The environment operation failed.",
                },
            ],
            isError: true,
        };
    }
}

function toolResult(text: string, structuredContent: JsonRecord): CallToolResult {
    return { content: [{ type: "text", text }], structuredContent };
}

interface HostOptions {
    readonly body?: JsonRecord;
    readonly method?: "GET" | "POST";
}

async function callHost(path: string, options: HostOptions = {}): Promise<JsonRecord> {
    const apiUrl = process.env.HAPPY2_PLUGIN_API_URL;
    const token = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!apiUrl || !token) throw new Error("Happy did not provide plugin host credentials.");
    const response = await fetch(new URL(path, `${apiUrl}/`), {
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        headers: {
            authorization: `Bearer ${token}`,
            ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        method: options.method ?? "GET",
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
        const error = recordOrUndefined(payload);
        throw new Error(
            typeof error?.message === "string"
                ? error.message
                : `Happy environment API returned HTTP ${response.status}.`,
        );
    }
    return record(payload, "Happy environment API response");
}

function requiredString(value: unknown, name: string, trim = true): string {
    if (typeof value !== "string" || !value.trim())
        throw new Error(`${name} must be a non-empty string.`);
    return trim ? value.trim() : value;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
}

function record(value: unknown, label: string): JsonRecord {
    const result = recordOrUndefined(value);
    if (!result) throw new Error(`${label} must be an object.`);
    return result;
}

function recordOrUndefined(value: unknown): JsonRecord | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonRecord)
        : undefined;
}
