import {
    PluginError,
    pluginHostPermissions,
    type PluginApiPermissionSection,
    type PluginHostPermission,
} from "../types.js";

const definitions = {
    "chats:update": {
        id: "chats:update",
        displayName: "Update current chat",
        description: "Change the current chat title and description.",
        section: "chats",
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
            { id: "chats", displayName: "Chats" },
            { id: "plugins", displayName: "Plugins" },
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
