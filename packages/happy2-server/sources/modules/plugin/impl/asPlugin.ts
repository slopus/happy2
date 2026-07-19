import type { PluginSourceKind, SystemPluginSummary } from "../types.js";
import { installedManifest } from "./installedManifest.js";
import { effectiveContainer } from "./effectiveContainer.js";

export function asSystemPlugin(row: Record<string, unknown>): SystemPluginSummary {
    const sourceKind = requiredString(row.sourceKind, "plugin source kind");
    if (!sourceKinds.has(sourceKind as PluginSourceKind))
        throw new Error(`Unknown plugin source kind ${sourceKind}`);
    const id = requiredString(row.id, "system plugin id");
    const contentType = requiredString(row.imageContentType, "plugin image content type");
    if (contentType !== "image/png") throw new Error(`Unknown plugin image type ${contentType}`);
    const manifest = installedManifest(requiredString(row.manifestJson, "plugin manifest"));
    const mcp = manifest.mcp;
    const localContainer = effectiveContainer(manifest);
    return {
        id,
        displayName: requiredString(row.displayName, "plugin display name"),
        shortName: requiredString(row.shortName, "plugin short name"),
        description: requiredString(row.description, "plugin description"),
        sourceKind: sourceKind as PluginSourceKind,
        sourceReference: requiredString(row.sourceReference, "plugin source reference"),
        sourceVersion: requiredString(row.sourceVersion, "plugin source version"),
        packageDigest: requiredString(row.packageDigest, "plugin package digest"),
        variables: manifest.variables,
        ...(mcp
            ? {
                  mcp: {
                      type: mcp.type,
                      container:
                          mcp.type === "remote"
                              ? ("none" as const)
                              : localContainer?.dockerfile
                                ? ("bundled" as const)
                                : ("selection_required" as const),
                  },
              }
            : {}),
        ...(localContainer
            ? {
                  container: {
                      image: localContainer.dockerfile
                          ? ("bundled" as const)
                          : ("selection_required" as const),
                      command: Boolean(localContainer.command),
                      permissions: localContainer.permissions,
                  },
              }
            : {}),
        image: {
            contentType,
            size: requiredNonnegativeInteger(row.imageSize, "plugin image size"),
            width: requiredPositiveInteger(row.imageWidth, "plugin image width"),
            height: requiredPositiveInteger(row.imageHeight, "plugin image height"),
            thumbhash: requiredString(row.imageThumbhash, "plugin image thumbhash"),
            checksumSha256: requiredString(row.imageChecksumSha256, "plugin image checksum"),
            url: `/v0/admin/systemPlugins/${id}/image`,
        },
        ...(optionalString(row.installedByUserId)
            ? { installedByUserId: optionalString(row.installedByUserId) }
            : {}),
        installedAt: requiredString(row.installedAt, "plugin install timestamp"),
        updatedAt: requiredString(row.updatedAt, "plugin update timestamp"),
    };
}

const sourceKinds = new Set<PluginSourceKind>(["builtin", "github", "upload", "zip_url"]);

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value) throw new Error(`Invalid ${name}`);
    return value;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

function requiredNonnegativeInteger(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
        throw new Error(`Invalid ${name}`);
    return value;
}

function requiredPositiveInteger(value: unknown, name: string): number {
    const result = requiredNonnegativeInteger(value, name);
    if (result === 0) throw new Error(`Invalid ${name}`);
    return result;
}
