import {
    PluginError,
    pluginHostPermissions,
    type PluginApiPermissionSection,
    type PluginHostPermission,
} from "../types.js";

const definitions = {
    "channels:create": {
        id: "channels:create",
        displayName: "Create channels",
        description: "Create public or private channels.",
        section: "channels",
        access: "mutations",
    },
    "channels:create-child": {
        id: "channels:create-child",
        displayName: "Create child channels",
        description:
            "Create a private child channel under the current channel with inherited access and an independent agent session. Posting an initial message also requires Send messages permission.",
        section: "channels",
        access: "mutations",
    },
    "chats:members:add": {
        id: "chats:members:add",
        displayName: "Add chat members",
        description: "Add signed users to a channel represented by a chat capability.",
        section: "chats",
        access: "mutations",
    },
    "chats:members:remove": {
        id: "chats:members:remove",
        displayName: "Remove chat members",
        description: "Remove signed users from a channel represented by a chat capability.",
        section: "chats",
        access: "mutations",
    },
    "chats:update": {
        id: "chats:update",
        displayName: "Update current chat",
        description: "Change the current chat title and description.",
        section: "chats",
        access: "mutations",
    },
    "chats:archive": {
        id: "chats:archive",
        displayName: "Archive chats",
        description: "Archive a channel represented by a chat capability.",
        section: "chats",
        access: "mutations",
    },
    "messages:send": {
        id: "messages:send",
        displayName: "Send messages",
        description: "Send a message as the user represented by a chat capability.",
        section: "messages",
        access: "mutations",
    },
    "messages:delete": {
        id: "messages:delete",
        displayName: "Delete messages",
        description: "Delete a message represented by a signed message capability.",
        section: "messages",
        access: "mutations",
    },
    "messages:history": {
        id: "messages:history",
        displayName: "Read message history",
        description: "Page message history in a chat without receiving entity capabilities.",
        section: "messages",
        access: "readOnly",
    },
    "messages:read": {
        id: "messages:read",
        displayName: "Read messages",
        description: "Read one message represented by a signed message capability.",
        section: "messages",
        access: "readOnly",
    },
    "reactions:add": {
        id: "reactions:add",
        displayName: "Add reactions",
        description: "Add a reaction as the user represented by the chat capability.",
        section: "reactions",
        access: "mutations",
    },
    "reactions:remove": {
        id: "reactions:remove",
        displayName: "Remove reactions",
        description: "Remove the user's reaction from a signed message.",
        section: "reactions",
        access: "mutations",
    },
    "search:users": {
        id: "search:users",
        displayName: "Search users",
        description: "Search visible users and receive installation-bound user capabilities.",
        section: "search",
        access: "readOnly",
    },
    "search:messages": {
        id: "search:messages",
        displayName: "Search messages",
        description: "Search visible messages and receive installation-bound message capabilities.",
        section: "search",
        access: "readOnly",
    },
    "search:chats": {
        id: "search:chats",
        displayName: "Search chats",
        description: "Search visible chats and receive installation-bound chat capabilities.",
        section: "search",
        access: "readOnly",
    },
    "commands:run": {
        id: "commands:run",
        displayName: "Run workspace commands",
        description:
            "Run a bounded Bash command in a chat workspace with explicit environment variables.",
        section: "commands",
        access: "mutations",
    },
    "workspace:read": {
        id: "workspace:read",
        displayName: "Read workspace files",
        description: "Read UTF-8 files from a chat workspace.",
        section: "workspace",
        access: "readOnly",
    },
    "workspace:write": {
        id: "workspace:write",
        displayName: "Write workspace files",
        description: "Write UTF-8 files when their expected content hash still matches.",
        section: "workspace",
        access: "mutations",
    },
    "documents:read": {
        id: "documents:read",
        displayName: "Read chat documents",
        description: "List and read documents attached to the current chat.",
        section: "documents",
        access: "readOnly",
    },
    "documents:write": {
        id: "documents:write",
        displayName: "Request document writes",
        description: "Stage document updates for approval by a member of the current chat.",
        section: "documents",
        access: "mutations",
    },
    "environments:read": {
        id: "environments:read",
        displayName: "View environments",
        description: "View agent environments and read their Dockerfiles.",
        section: "environments",
        access: "readOnly",
    },
    "environments:manage": {
        id: "environments:manage",
        displayName: "Manage environments",
        description: "Create agent environments and select the default.",
        section: "environments",
        access: "mutations",
    },
    "environments:deactivate": {
        id: "environments:deactivate",
        displayName: "Deactivate environments",
        description: "Deactivate unused custom agent environments while retaining their manifests.",
        section: "environments",
        access: "mutations",
    },
    "apps:manage": {
        id: "apps:manage",
        displayName: "Manage app surfaces",
        description: "Create and update durable MCP App destinations for an authorized audience.",
        section: "apps",
        access: "mutations",
    },
    "contributions:manage": {
        id: "contributions:manage",
        displayName: "Manage app actions",
        description:
            "Create and update typed actions in Happy's native menus, composer, and settings surfaces.",
        section: "apps",
        access: "mutations",
    },
    "plugins:list": {
        id: "plugins:list",
        displayName: "View plugins",
        description: "View installed plugins and their current status.",
        section: "plugins",
        access: "readOnly",
    },
    "plugins:install": {
        id: "plugins:install",
        displayName: "Install plugins",
        description: "Install another plugin and choose the permissions granted to it.",
        section: "plugins",
        access: "mutations",
    },
    "plugins:uninstall": {
        id: "plugins:uninstall",
        displayName: "Uninstall plugins",
        description: "Stop and uninstall an existing plugin installation.",
        section: "plugins",
        access: "mutations",
    },
    "plugins:request-install": {
        id: "plugins:request-install",
        displayName: "Request plugin installs",
        description: "Ask a user in the current chat to approve installing a plugin.",
        section: "plugins",
        access: "mutations",
    },
    "plugins:request-uninstall": {
        id: "plugins:request-uninstall",
        displayName: "Request plugin uninstalls",
        description: "Ask a user in the current chat to approve uninstalling a plugin.",
        section: "plugins",
        access: "mutations",
    },
    "port-sharing:read": {
        id: "port-sharing:read",
        displayName: "View shared ports",
        description: "View active shared ports for a chat represented by a chat capability.",
        section: "port-sharing",
        access: "readOnly",
    },
    "port-sharing:expose": {
        id: "port-sharing:expose",
        displayName: "Expose agent ports",
        description: "Expose one supported port from the agent represented by a chat capability.",
        section: "port-sharing",
        access: "mutations",
    },
    "port-sharing:disable": {
        id: "port-sharing:disable",
        displayName: "Disable shared ports",
        description: "Disable an active shared port represented by a chat capability.",
        section: "port-sharing",
        access: "mutations",
    },
    "port-sharing:access": {
        id: "port-sharing:access",
        displayName: "Access shared ports",
        description:
            "Create a user-and-subdomain access token after enforcing the active share's audience.",
        section: "port-sharing",
        access: "mutations",
    },
} as const satisfies Record<
    PluginHostPermission,
    {
        id: PluginHostPermission;
        displayName: string;
        description: string;
        section: PluginApiPermissionSection["id"];
        access: "readOnly" | "mutations";
    }
>;

const pluginHostPermissionSet = new Set(pluginHostPermissions);

export function pluginApiPermissionSections(
    permissions: readonly PluginHostPermission[],
): PluginApiPermissionSection[] {
    const requested = permissions.map((permission) => definitions[permission]);
    return (
        [
            { id: "channels", displayName: "Channels" },
            { id: "chats", displayName: "Chats" },
            { id: "messages", displayName: "Messages" },
            { id: "reactions", displayName: "Reactions" },
            { id: "search", displayName: "Search" },
            { id: "commands", displayName: "Commands" },
            { id: "workspace", displayName: "Workspace" },
            { id: "documents", displayName: "Documents" },
            { id: "environments", displayName: "Environments" },
            { id: "apps", displayName: "App surfaces" },
            { id: "plugins", displayName: "Plugins" },
            { id: "port-sharing", displayName: "Port sharing" },
        ] as const
    ).flatMap((section) => {
        const definitionsForSection = requested.filter(
            (definition) => definition.section === section.id,
        );
        if (definitionsForSection.length === 0) return [];
        return [
            {
                ...section,
                readOnly: definitionsForSection
                    .filter(({ access }) => access === "readOnly")
                    .map(({ access: _, section: __, ...definition }) => definition),
                mutations: definitionsForSection
                    .filter(({ access }) => access === "mutations")
                    .map(({ access: _, section: __, ...definition }) => definition),
            },
        ];
    });
}

export function pluginPermissionsValidate(
    requested: readonly PluginHostPermission[],
    declared: readonly PluginHostPermission[],
): PluginHostPermission[] {
    const declaredSet = new Set(declared);
    const granted: PluginHostPermission[] = [];
    for (const permission of requested) {
        if (!pluginHostPermissionSet.has(permission))
            throw new PluginError(
                "broken_configuration",
                `Unknown plugin permission ${permission}`,
            );
        if (granted.includes(permission))
            throw new PluginError(
                "broken_configuration",
                `Duplicate plugin permission ${permission}`,
            );
        if (!declaredSet.has(permission))
            throw new PluginError(
                "broken_configuration",
                `Plugin did not declare permission ${permission}`,
            );
        granted.push(permission);
    }
    return granted;
}

export function pluginPermissionsParse(source: string): PluginHostPermission[] {
    let value: unknown;
    try {
        value = JSON.parse(source);
    } catch {
        throw new Error("Installed plugin permissions are unreadable");
    }
    if (
        !Array.isArray(value) ||
        value.some(
            (permission) =>
                typeof permission !== "string" ||
                !pluginHostPermissionSet.has(permission as PluginHostPermission),
        ) ||
        new Set(value).size !== value.length
    )
        throw new Error("Installed plugin permissions are unreadable");
    return value as PluginHostPermission[];
}
