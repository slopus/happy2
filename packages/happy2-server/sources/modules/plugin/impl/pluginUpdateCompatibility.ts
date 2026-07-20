import {
    pluginHostPermissions,
    type PluginHostPermission,
    type PluginManifest,
    type PluginPackage,
    type PluginSourceKind,
} from "../types.js";
import { PluginError } from "../types.js";
import { effectiveContainer } from "./effectiveContainer.js";

export interface PluginUpdateInstallationInput {
    containerImageId: string | null;
    containerName: string | null;
    grantedPermissionsJson: string;
    id: string;
}

export interface PluginUpdateVariableInput {
    installationId: string;
    key: string;
    kind: string;
}

export interface PluginUpdateInstallationPlan {
    containerImageId: string | null;
    containerName: string | null;
    grantedPermissions: PluginHostPermission[];
    id: string;
    ready: boolean;
}

export function pluginUpdateCompatibility(
    manifest: PluginManifest,
    installations: readonly PluginUpdateInstallationInput[],
    variables: readonly PluginUpdateVariableInput[],
): PluginUpdateInstallationPlan[] {
    const definitions = new Map(
        manifest.variables.map((definition) => [definition.key, definition]),
    );
    const localContainer = effectiveContainer(manifest);
    const selectionRequired = Boolean(localContainer && !localContainer.dockerfile);
    const declared = new Set(localContainer?.permissions ?? []);
    const hasRuntime = Boolean(localContainer || manifest.mcp?.type === "remote");
    return installations.map((installation) => {
        const configured = new Map(
            variables
                .filter((variable) => variable.installationId === installation.id)
                .map((variable) => [variable.key, variable.kind]),
        );
        for (const [key, definition] of definitions) {
            const kind = configured.get(key);
            if (kind === undefined)
                throw new PluginError(
                    "conflict",
                    `Installation ${installation.id} needs a value for the new ${key} variable before this plugin can be updated`,
                );
            if (kind !== definition.kind)
                throw new PluginError(
                    "conflict",
                    `Installation ${installation.id} has an incompatible ${key} variable`,
                );
        }
        if (selectionRequired && !installation.containerImageId)
            throw new PluginError(
                "conflict",
                `Installation ${installation.id} needs a container image before this plugin can be updated`,
            );
        return {
            id: installation.id,
            containerImageId: selectionRequired ? installation.containerImageId : null,
            containerName: localContainer ? `happy2-plugin-${installation.id}` : null,
            grantedPermissions: readablePermissions(installation.grantedPermissionsJson).filter(
                (permission) => declared.has(permission),
            ),
            ready: !hasRuntime,
        };
    });
}

export function pluginUpdateRemovedVariableKeys(
    manifest: PluginManifest,
    variables: readonly PluginUpdateVariableInput[],
): string[] {
    const declared = new Set(manifest.variables.map(({ key }) => key));
    return [...new Set(variables.map(({ key }) => key).filter((key) => !declared.has(key)))];
}

export function pluginUpdateIdentityRequire(
    current: { shortName: string; sourceKind: string; sourceReference: string },
    replacement: PluginPackage,
): void {
    if (replacement.manifest.shortName !== current.shortName)
        throw new PluginError("invalid_package", "Updated plugin shortName changed");
    if (
        replacement.source.kind !== (current.sourceKind as PluginSourceKind) ||
        replacement.source.reference !== current.sourceReference
    )
        throw new PluginError("invalid_package", "Updated plugin source identity changed");
}

function readablePermissions(value: string): PluginHostPermission[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const requested = new Set(
        parsed.filter((permission): permission is string => typeof permission === "string"),
    );
    return pluginHostPermissions.filter((permission) => requested.has(permission));
}
