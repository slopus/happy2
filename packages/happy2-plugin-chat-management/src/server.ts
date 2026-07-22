import { randomUUID } from "node:crypto";
import {
    McpServer,
    happyCallContext,
    startPluginServer,
    type CallToolResult,
    type HappyCallContext,
    type JsonObject,
} from "happy2-plugin-sdk/server";
import { z } from "zod/v4";

const USERS_META_KEY = "happy2/users";
const server = new McpServer({ name: "happy2-chat-management", version: "1.6.0" });

const chatUpdateSchema = z
    .strictObject({
        title: z
            .string()
            .min(1)
            .max(100)
            .optional()
            .describe("The new title for the current chat."),
        description: z
            .string()
            .max(500)
            .nullable()
            .optional()
            .describe("The new description, or null to clear the current description."),
    })
    .refine((input) => input.title !== undefined || input.description !== undefined, {
        message: "A title or description is required.",
    })
    .meta({ anyOf: [{ required: ["title"] }, { required: ["description"] }] });

server.registerTool(
    "chat_update",
    {
        title: "Update current chat",
        description:
            "Changes the title or description of the current chat. Omit a field to leave it unchanged; pass null or an empty string to clear the description.",
        inputSchema: chatUpdateSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const chat = requireChat(happyCallContext(extra));
            const result = await callHost<{ chat: JsonObject }>(
                "/chats/updateChat",
                chat.token,
                input,
            );
            return success(`Updated chat ${String(result.chat.id)}.`, { chat: result.chat });
        }),
);

const messageSendSchema = z.strictObject({
    text: z.string().min(1).max(40_000).describe("The message to post to the current chat."),
    audience: z
        .enum(["agents", "people"])
        .describe("agents starts the current agent; people posts without inference."),
});

server.registerTool(
    "message_send",
    {
        title: "Send a message",
        description:
            "Posts an automated message to the current chat on behalf of the user who triggered this turn. An agents message starts the current agent working; a people message only shares context and does not trigger inference.",
        inputSchema: messageSendSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const chat = requireChat(happyCallContext(extra));
            const result = await callHost<{ message: JsonObject }>("/messages/send", chat.token, {
                ...input,
                idempotencyKey: randomUUID(),
            });
            return success(`Sent message ${String(result.message.id)}.`, result);
        }),
);

const usernameList = z
    .array(z.string().min(1))
    .max(100)
    .refine((items) => new Set(items).size === items.length, "Usernames must be unique.")
    .meta({ uniqueItems: true });
const memberUpdateSchema = z
    .strictObject({
        addUsers: usernameList.optional().describe("Usernames (with or without @) to add."),
        removeUsers: usernameList.optional().describe("Usernames (with or without @) to remove."),
    })
    .refine((input) => input.addUsers !== undefined || input.removeUsers !== undefined, {
        message: "addUsers or removeUsers is required.",
    })
    .meta({ anyOf: [{ required: ["addUsers"] }, { required: ["removeUsers"] }] });

server.registerTool(
    "channel_members_update",
    {
        title: "Add or remove channel members",
        description:
            "Adds or removes users from the current channel. This never changes direct-message membership. Identify users by the @username shown in the triggering conversation; only users supplied in Happy's signed metadata are available.",
        inputSchema: memberUpdateSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const context = happyCallContext(extra);
            const chat = requireChat(context);
            const users = referencedUsers(extra._meta?.[USERS_META_KEY]);
            const add = resolveUsers(input.addUsers ?? [], users, "addUsers");
            const remove = resolveUsers(input.removeUsers ?? [], users, "removeUsers");
            if (!add.length && !remove.length)
                throw new Error("At least one user must be added or removed.");
            const result = await callHost<{
                addedUserIds: string[];
                chatId: string;
                removedUserIds: string[];
            }>("/channels/updateMembers", chat.token, { add, remove });
            return success(
                `Updated members of channel ${result.chatId}: added ${result.addedUserIds.length}, removed ${result.removedUserIds.length}.`,
                result,
            );
        }),
);

const initialMessageSchema = z.strictObject({
    text: z
        .string()
        .min(1)
        .max(40_000)
        .describe("A copied or rephrased opening prompt or informational message."),
    audience: z
        .enum(["agents", "people"])
        .describe("agents starts the current agent; people posts without inference."),
});
const directMessageInitialMessageSchema = z.strictObject({
    text: z.string().min(1).max(40_000).describe("The opening message to send to the user."),
});
const directMessageCreateSchema = z.strictObject({
    user: z
        .string()
        .min(1)
        .max(128)
        .describe("Referenced username (with or without @) to message."),
    initialMessage: directMessageInitialMessageSchema.optional(),
});

server.registerTool(
    "direct_message_create",
    {
        title: "Create a direct message",
        description:
            "Creates or reuses a direct message between the user who triggered this turn and one referenced user. It can post an opening people-only message on behalf of the triggering user without starting agent inference.",
        inputSchema: directMessageCreateSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const chat = requireChat(happyCallContext(extra));
            const users = referencedUsers(extra._meta?.[USERS_META_KEY]);
            const user = resolveUsers([input.user], users, "user")[0]!;
            const result = await callHost<{ chat: JsonObject; initialMessage?: JsonObject }>(
                "/direct-messages/createDirectMessage",
                chat.token,
                {
                    user,
                    ...(input.initialMessage ? { initialMessage: input.initialMessage } : {}),
                    idempotencyKey: randomUUID(),
                },
            );
            return success(
                `Opened direct message ${String(result.chat.id)}${result.initialMessage ? " and posted its initial message" : ""}.`,
                result,
            );
        }),
);

const channelCreateSchema = z.strictObject({
    name: z.string().min(1).max(100).describe("Channel title."),
    description: z.string().min(1).max(500).optional().describe("Optional channel description."),
    visibility: z
        .enum(["public", "private"])
        .default("public")
        .describe("Channel visibility. Defaults to public."),
    members: usernameList.optional().describe("Referenced usernames (with or without @) to add."),
    initialMessage: initialMessageSchema.optional(),
});

server.registerTool(
    "channel_create",
    {
        title: "Create a channel",
        description:
            "Creates a public channel by default with the triggering user as its creator and administrator, or a private channel owned by that user. It adds selected referenced users and can post an initial message. An agents message starts the current agent working; a people message only shares context and does not trigger inference.",
        inputSchema: channelCreateSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const chat = requireChat(happyCallContext(extra));
            const users = referencedUsers(extra._meta?.[USERS_META_KEY]);
            const members = resolveUsers(input.members ?? [], users, "members");
            const result = await callHost<{ chat: JsonObject; initialMessage?: JsonObject }>(
                "/channels/createChannel",
                chat.token,
                { ...input, members, idempotencyKey: randomUUID() },
            );
            return success(
                `Created channel ${String(result.chat.id)}${result.initialMessage ? " and posted its initial message" : ""}.`,
                result,
            );
        }),
);

const projectChannelSchema = z.strictObject({
    name: z.string().min(1).max(100).describe("Channel title."),
    description: z.string().min(1).max(500).optional().describe("Channel description."),
    visibility: z
        .enum(["public", "private"])
        .default("public")
        .describe("Channel visibility. Defaults to public."),
});
const projectCreateSchema = z.strictObject({
    name: z.string().min(1).max(100).describe("Project name."),
    description: z.string().min(1).max(500).optional().describe("Project description."),
    owner: z
        .string()
        .min(1)
        .optional()
        .describe(
            "Referenced username to credit as project steward, public-channel creator, and private-channel owner. Defaults to the triggering user.",
        ),
    people: usernameList
        .optional()
        .describe("Referenced usernames to add to every initial channel."),
    channels: z
        .array(projectChannelSchema)
        .min(1)
        .max(20)
        .describe("The project's initial public and private channels."),
});

server.registerTool(
    "project_create",
    {
        title: "Create a project",
        description:
            "Creates a project with 1-20 initial channels. The selected owner is credited as project steward and becomes creator/admin of public channels and owner of private channels; public channels never receive an owner. Selected people join every initial channel. Project visibility continues to derive from those channels.",
        inputSchema: projectCreateSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const chat = requireChat(happyCallContext(extra));
            const users = referencedUsers(extra._meta?.[USERS_META_KEY]);
            const owner = input.owner ? resolveUsers([input.owner], users, "owner")[0] : undefined;
            const people = resolveUsers(input.people ?? [], users, "people");
            const result = await callHost<{
                project: JsonObject;
                channels: { chat: JsonObject; token: string }[];
            }>("/projects/createProject", chat.token, {
                name: input.name,
                ...(input.description ? { description: input.description } : {}),
                ...(owner ? { owner } : {}),
                people,
                channels: input.channels,
                idempotencyKey: randomUUID(),
            });
            return success(
                `Created project ${String(result.project.id)} with ${result.channels.length} channels.`,
                result,
            );
        }),
);

const childCreateSchema = z.strictObject({
    name: z.string().min(1).max(100).describe("Child channel title."),
    description: z
        .string()
        .min(1)
        .max(500)
        .optional()
        .describe("Optional child channel description."),
    agentModelId: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe("Optional available agent model ID for this child's independent session."),
    initialMessage: initialMessageSchema.optional(),
});

server.registerTool(
    "channel_child_create",
    {
        title: "Create a child channel",
        description:
            "Creates a child channel under the current top-level channel and can post an initial message. It matches the parent's visibility and shares its workspace while keeping independent membership, conversation history, and agent session. Parent members can join or leave it separately.",
        inputSchema: childCreateSchema,
    },
    (input, extra) =>
        safeTool(async () => {
            const chat = requireChat(happyCallContext(extra));
            const result = await callHost<{ chat: JsonObject; initialMessage?: JsonObject }>(
                "/channels/createChildChannel",
                chat.token,
                input,
            );
            return success(
                `Created child channel ${String(result.chat.id)}${result.initialMessage ? " and posted its initial message" : ""}.`,
                result,
            );
        }),
);

interface ReferencedUser {
    readonly id: string;
    readonly token: string;
    readonly username?: string;
}

function requireChat(context: HappyCallContext) {
    if (!context.chat) throw new Error("This tool must be called from an active Happy chat.");
    return context.chat;
}

function referencedUsers(value: unknown): readonly ReferencedUser[] {
    if (!Array.isArray(value)) throw new Error("Happy did not provide referenced-user metadata.");
    return value.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw as never;
        const user = raw as Record<string, unknown>;
        return {
            id: typeof user.id === "string" ? user.id : "",
            token: typeof user.token === "string" ? user.token : "",
            ...(typeof user.username === "string" ? { username: user.username } : {}),
        };
    });
}

function resolveUsers(
    selectors: readonly string[],
    users: readonly ReferencedUser[],
    name: string,
): readonly { id: string; token: string }[] {
    const resolved = selectors.map((selector) => {
        const normalized = selector.trim().replace(/^@/, "").toLowerCase();
        const matches = users.filter(
            (user) =>
                user &&
                (user.id === selector.trim() || user.username?.toLowerCase() === normalized),
        );
        if (matches.length !== 1)
            throw new Error(`User ${selector} is not uniquely available in this turn.`);
        const user = matches[0]!;
        if (!user.id || !user.token)
            throw new Error(`User ${selector} has malformed capability metadata.`);
        return { id: user.id, token: user.token };
    });
    if (new Set(resolved.map(({ id }) => id)).size !== resolved.length)
        throw new Error(`${name} contains a duplicate user.`);
    return resolved;
}

async function callHost<T>(path: string, chatToken: string, body: unknown): Promise<T> {
    const base = process.env.HAPPY2_PLUGIN_API_URL;
    const token = process.env.HAPPY2_PLUGIN_API_TOKEN;
    if (!base || !token) throw new Error("The Happy Plugin API is unavailable.");
    const response = await fetch(new URL(path.replace(/^\//, ""), trailingSlash(base)), {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "x-happy2-chat-token": chatToken,
        },
        body: JSON.stringify(body),
    });
    const result: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(message(result) ?? "The chat action failed.");
    return result as T;
}

function trailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function message(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const candidate = (value as Record<string, unknown>).message;
    return typeof candidate === "string" ? candidate : undefined;
}

function success(text: string, structuredContent: JsonObject): CallToolResult {
    return { content: [{ type: "text", text }], structuredContent };
}

async function safeTool(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await work();
    } catch (error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: error instanceof Error ? error.message : "The chat could not be updated.",
                },
            ],
        };
    }
}

await startPluginServer(server);
