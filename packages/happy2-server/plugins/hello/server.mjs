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
    const result = handle(request);
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, ...result })}\n`);
}

function handle(request) {
    if (request.method === "initialize") {
        return {
            result: {
                protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "happy2-hello", version: "1.0.0" },
            },
        };
    }
    if (request.method === "ping") return { result: {} };
    if (request.method === "tools/list") {
        return {
            result: {
                tools: [
                    {
                        name: "hello_greet",
                        title: "Greet someone",
                        description: "Creates a short, friendly greeting for a person.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    description: "The name of the person to greet.",
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
    if (request.method === "tools/call" && request.params?.name === "hello_greet") {
        const name =
            typeof request.params.arguments?.name === "string"
                ? request.params.arguments.name.trim()
                : "";
        if (!name) {
            return {
                result: {
                    isError: true,
                    content: [{ type: "text", text: "A non-empty name is required." }],
                },
            };
        }
        return {
            result: {
                content: [{ type: "text", text: `Hello, ${name}! It’s lovely to meet you.` }],
            },
        };
    }
    return {
        error: { code: -32601, message: `Method not found: ${String(request.method)}` },
    };
}
