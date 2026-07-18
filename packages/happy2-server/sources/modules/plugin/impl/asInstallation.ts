import type { PluginInstallationStatus, PluginInstallationSummary } from "../types.js";

const statuses: readonly PluginInstallationStatus[] = [
    "preparing",
    "starting",
    "ready",
    "broken_configuration",
    "failed",
];

export function asPluginInstallation(row: Record<string, unknown>): PluginInstallationSummary {
    const status = requiredString(row.status, "plugin installation status");
    if (!statuses.includes(status as PluginInstallationStatus))
        throw new Error(`Unknown plugin installation status ${status}`);
    const sourceKind = requiredString(row.sourceKind, "plugin source kind");
    if (sourceKind !== "builtin") throw new Error(`Unknown plugin source kind ${sourceKind}`);
    return {
        id: requiredString(row.id, "plugin installation id"),
        pluginId: requiredString(row.pluginId, "system plugin id"),
        shortName: requiredString(row.shortName, "plugin short name"),
        sourceKind,
        sourceReference: requiredString(row.sourceReference, "plugin source reference"),
        sourceVersion: requiredString(row.sourceVersion, "plugin source version"),
        packageDigest: requiredString(row.packageDigest, "plugin package digest"),
        status: status as PluginInstallationStatus,
        ...(optionalString(row.statusDetail)
            ? { statusDetail: optionalString(row.statusDetail) }
            : {}),
        ...(optionalString(row.lastError) ? { lastError: optionalString(row.lastError) } : {}),
        ...(optionalString(row.containerImageId)
            ? { containerImageId: optionalString(row.containerImageId) }
            : {}),
        ...(optionalString(row.installedByUserId)
            ? { installedByUserId: optionalString(row.installedByUserId) }
            : {}),
        installedAt: requiredString(row.installedAt, "plugin installation timestamp"),
        updatedAt: requiredString(row.updatedAt, "plugin update timestamp"),
        ...(optionalString(row.readyAt) ? { readyAt: optionalString(row.readyAt) } : {}),
    };
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value) throw new Error(`Invalid ${name}`);
    return value;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}
