import { createInterface } from "node:readline";

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
                    text:
                        error instanceof Error
                            ? error.message
                            : "The environment operation failed.",
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
                serverInfo: { name: "happy2-environment-management", version: "1.0.0" },
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
        case "happy2_environments_list":
            return { result: await listEnvironments() };
        case "happy2_environment_get_dockerfile":
            return { result: await getDockerfile(input) };
        case "happy2_environment_create":
            return { result: await createEnvironment(input) };
        case "happy2_environment_set_default":
            return { result: await setDefaultEnvironment(input) };
        case "happy2_environment_deactivate":
            return { result: await deactivateEnvironment(input) };
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
    const environmentId = {
        type: "string",
        minLength: 1,
        maxLength: 128,
        description: "The environment ID returned by happy2_environments_list or creation.",
    };
    return [
        {
            name: "happy2_environments_list",
            title: "List agent environments",
            description:
                "Lists active and inactive Happy agent environments, their build status, and the current default environment.",
            inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
        {
            name: "happy2_environment_get_dockerfile",
            title: "Read an environment Dockerfile",
            description:
                "Returns the retained immutable Dockerfile and active state for one Happy agent environment.",
            inputSchema: {
                type: "object",
                properties: { environmentId },
                required: ["environmentId"],
                additionalProperties: false,
            },
        },
        {
            name: "happy2_environment_create",
            title: "Create or reactivate an agent environment",
            description:
                "Creates an immutable Happy agent environment and queues its Docker image build. The exact definition of an inactive environment is reactivated under the same ID and rebuilt. Creation returns before the build is ready.",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        minLength: 1,
                        maxLength: 100,
                        description: "A concise human-readable environment name.",
                    },
                    dockerfile: {
                        type: "string",
                        minLength: 1,
                        maxLength: 262144,
                        description: "The complete Dockerfile used to build the environment.",
                    },
                },
                required: ["name", "dockerfile"],
                additionalProperties: false,
            },
        },
        {
            name: "happy2_environment_set_default",
            title: "Set the default agent environment",
            description:
                "Selects a ready environment as the default for agents created in the future. Existing agents keep their assigned environment.",
            inputSchema: {
                type: "object",
                properties: { environmentId },
                required: ["environmentId"],
                additionalProperties: false,
            },
        },
        {
            name: "happy2_environment_deactivate",
            title: "Deactivate an unused agent environment",
            description:
                "Deactivates a custom environment only when it is unused. Happy permanently retains its manifest and Dockerfile so the same definition can be reactivated and rebuilt later.",
            inputSchema: {
                type: "object",
                properties: { environmentId },
                required: ["environmentId"],
                additionalProperties: false,
            },
        },
    ];
}

async function listEnvironments() {
    const result = await callHost("/environments");
    return toolResult(
        `Found ${result.environments.length} agent environment${result.environments.length === 1 ? "" : "s"}.`,
        result,
    );
}

async function getDockerfile(input) {
    const environmentId = requiredString(input, "environmentId");
    const result = await callHost(`/environments/${encodeURIComponent(environmentId)}/dockerfile`);
    return toolResult(`Read the Dockerfile for ${result.environment.name}.`, result);
}

async function createEnvironment(input) {
    const name = requiredString(input, "name");
    const dockerfile = requiredString(input, "dockerfile", false);
    const result = await callHost("/environments/createEnvironment", {
        method: "POST",
        body: { name, dockerfile },
    });
    return toolResult(
        `Environment ${result.environment.name} is active; its image build is ${result.environment.status}.`,
        result,
    );
}

async function setDefaultEnvironment(input) {
    const environmentId = requiredString(input, "environmentId");
    const result = await callHost(
        `/environments/${encodeURIComponent(environmentId)}/setDefaultEnvironment`,
        { method: "POST", body: {} },
    );
    return toolResult(`Set ${result.environment.name} as the default environment.`, result);
}

async function deactivateEnvironment(input) {
    const environmentId = requiredString(input, "environmentId");
    const result = await callHost(
        `/environments/${encodeURIComponent(environmentId)}/deactivateEnvironment`,
        { method: "POST", body: {} },
    );
    return toolResult(`Deactivated environment ${result.environmentId}.`, result);
}

function requiredString(input, name, trim = true) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Tool arguments must be an object.");
    const value = input[name];
    if (typeof value !== "string" || !value.trim())
        throw new Error(`${name} must be a non-empty string.`);
    return trim ? value.trim() : value;
}

function toolResult(text, structuredContent) {
    return {
        content: [{ type: "text", text }],
        structuredContent,
    };
}

async function callHost(path, options = {}) {
    const apiUrl = process.env.HAPPY2_PLUGIN_API_URL;
    const token = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!apiUrl || !token) throw new Error("Happy did not provide plugin host credentials.");
    const response = await fetch(new URL(path, `${apiUrl}/`), {
        method: options.method ?? "GET",
        headers: {
            authorization: `Bearer ${token}`,
            ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
        const message =
            payload && typeof payload.message === "string"
                ? payload.message
                : `Happy environment API returned HTTP ${response.status}.`;
        throw new Error(message);
    }
    return payload;
}
