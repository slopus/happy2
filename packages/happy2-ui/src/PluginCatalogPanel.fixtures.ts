import { type PluginApiPermissionSection, type PluginHostPermission } from "happy2-state";

/**
 * The complete granular host-permission catalog the server returns, in the exact
 * section order (`channels`, `chats`, `messages`, `reactions`, `search`,
 * `commands`, `workspace`, `environments`, `plugins`) with each capability split
 * into its `readOnly` and `mutations` access class. Shared verbatim by the
 * blueprint page and the cross-browser renderer tests so both prove the same
 * worst-case list — all nine sections and every one of the twenty-five
 * capabilities — with no drift between the specimen and its assertions.
 *
 * Typed against the closed happy2-state `PluginApiPermissionSection` shape so
 * every section and permission id is compiler-checked against the wire contract
 * (a stale id fails the build); the value stays structurally usable by
 * `PluginCatalogPanel`, whose section type is a supertype of this one.
 */
export const GRANULAR_PERMISSION_SECTIONS: readonly PluginApiPermissionSection[] = [
    {
        id: "channels",
        displayName: "Channels",
        readOnly: [],
        mutations: [
            {
                id: "channels:create",
                displayName: "Create channels",
                description: "Create public or private channels.",
            },
        ],
    },
    {
        id: "chats",
        displayName: "Chats",
        readOnly: [],
        mutations: [
            {
                id: "chats:members:add",
                displayName: "Add chat members",
                description: "Add signed users to a channel represented by a chat capability.",
            },
            {
                id: "chats:members:remove",
                displayName: "Remove chat members",
                description: "Remove signed users from a channel represented by a chat capability.",
            },
            {
                id: "chats:update",
                displayName: "Update current chat",
                description: "Change the current chat title and description.",
            },
            {
                id: "chats:archive",
                displayName: "Archive chats",
                description: "Archive a channel represented by a chat capability.",
            },
        ],
    },
    {
        id: "messages",
        displayName: "Messages",
        readOnly: [
            {
                id: "messages:history",
                displayName: "Read message history",
                description:
                    "Page message history in a chat without receiving entity capabilities.",
            },
            {
                id: "messages:read",
                displayName: "Read messages",
                description: "Read one message represented by a signed message capability.",
            },
        ],
        mutations: [
            {
                id: "messages:send",
                displayName: "Send messages",
                description: "Send a message as the user represented by a chat capability.",
            },
            {
                id: "messages:delete",
                displayName: "Delete messages",
                description: "Delete a message represented by a signed message capability.",
            },
        ],
    },
    {
        id: "reactions",
        displayName: "Reactions",
        readOnly: [],
        mutations: [
            {
                id: "reactions:add",
                displayName: "Add reactions",
                description: "Add a reaction as the user represented by the chat capability.",
            },
            {
                id: "reactions:remove",
                displayName: "Remove reactions",
                description: "Remove the user's reaction from a signed message.",
            },
        ],
    },
    {
        id: "search",
        displayName: "Search",
        readOnly: [
            {
                id: "search:users",
                displayName: "Search users",
                description:
                    "Search visible users and receive installation-bound user capabilities.",
            },
            {
                id: "search:messages",
                displayName: "Search messages",
                description:
                    "Search visible messages and receive installation-bound message capabilities.",
            },
            {
                id: "search:chats",
                displayName: "Search chats",
                description:
                    "Search visible chats and receive installation-bound chat capabilities.",
            },
        ],
        mutations: [],
    },
    {
        id: "commands",
        displayName: "Commands",
        readOnly: [],
        mutations: [
            {
                id: "commands:run",
                displayName: "Run workspace commands",
                description:
                    "Run a bounded Bash command in a chat workspace with explicit environment variables.",
            },
        ],
    },
    {
        id: "workspace",
        displayName: "Workspace",
        readOnly: [
            {
                id: "workspace:read",
                displayName: "Read workspace files",
                description: "Read UTF-8 files from a chat workspace.",
            },
        ],
        mutations: [
            {
                id: "workspace:write",
                displayName: "Write workspace files",
                description: "Write UTF-8 files when their expected content hash still matches.",
            },
        ],
    },
    {
        id: "environments",
        displayName: "Environments",
        readOnly: [
            {
                id: "environments:read",
                displayName: "View environments",
                description: "View agent environments and read their Dockerfiles.",
            },
        ],
        mutations: [
            {
                id: "environments:manage",
                displayName: "Manage environments",
                description: "Create agent environments and select the default.",
            },
            {
                id: "environments:deactivate",
                displayName: "Deactivate environments",
                description:
                    "Deactivate unused custom agent environments while retaining their manifests.",
            },
        ],
    },
    {
        id: "plugins",
        displayName: "Plugins",
        readOnly: [
            {
                id: "plugins:list",
                displayName: "View plugins",
                description: "View installed plugins and their current status.",
            },
        ],
        mutations: [
            {
                id: "plugins:install",
                displayName: "Install plugins",
                description: "Install another plugin and choose the permissions granted to it.",
            },
            {
                id: "plugins:uninstall",
                displayName: "Uninstall plugins",
                description: "Stop and uninstall an existing plugin installation.",
            },
            {
                id: "plugins:request-install",
                displayName: "Request plugin installs",
                description: "Ask a user in the current chat to approve installing a plugin.",
            },
            {
                id: "plugins:request-uninstall",
                displayName: "Request plugin uninstalls",
                description: "Ask a user in the current chat to approve uninstalling a plugin.",
            },
        ],
    },
];

/** The ordered section display names the granular catalog renders. */
export const GRANULAR_SECTION_TITLES: readonly string[] = GRANULAR_PERMISSION_SECTIONS.map(
    (section) => section.displayName,
);

/** Every granular capability id in section-then-access order (read-only before mutations). */
export const GRANULAR_PERMISSION_IDS: readonly PluginHostPermission[] =
    GRANULAR_PERMISSION_SECTIONS.flatMap((section) =>
        [...section.readOnly, ...section.mutations].map((permission) => permission.id),
    );
