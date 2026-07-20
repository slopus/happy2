import { McpServer, startPluginServer } from "happy2-plugin-sdk/server";
import { z } from "zod";

const server = new McpServer({ name: "happy2-hello", version: "1.0.0" });

server.registerTool(
    "hello_greet",
    {
        description: "Creates a short, friendly greeting for a person.",
        inputSchema: z
            .object({
                name: z.string().describe("The name of the person to greet."),
            })
            .strict(),
        title: "Greet someone",
    },
    ({ name }) => {
        const trimmedName = name.trim();
        if (!trimmedName)
            return {
                content: [{ type: "text" as const, text: "A non-empty name is required." }],
                isError: true,
            };
        return {
            content: [
                {
                    type: "text" as const,
                    text: `Hello, ${trimmedName}! It’s lovely to meet you.`,
                },
            ],
        };
    },
);

await startPluginServer(server);
