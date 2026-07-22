import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        version: "1.5.0",
        displayName: "Chat Management",
        shortName: "chat-management",
        description:
            "Lets an agent send messages, update its current chat, manage channel members, and create projects, top-level channels, or child channels.",
        permissions: [
            "projects:create",
            "channels:create",
            "channels:create-child",
            "chats:members:add",
            "chats:members:remove",
            "chats:update",
            "messages:send",
        ],
    },
});
