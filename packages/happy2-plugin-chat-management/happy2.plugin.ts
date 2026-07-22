import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        version: "1.6.0",
        displayName: "Chat Management",
        shortName: "chat-management",
        description:
            "Lets an agent send messages, update its current chat, manage channel members, and create direct messages, projects, top-level channels, or child channels.",
        permissions: [
            "projects:create",
            "channels:create",
            "channels:create-child",
            "direct-messages:create",
            "chats:members:add",
            "chats:members:remove",
            "chats:update",
            "messages:send",
        ],
    },
});
