import type { SystemPluginSummary } from "../types.js";
import { installedManifest } from "./installedManifest.js";

export function asSystemPlugin(row: Record<string, unknown>): SystemPluginSummary {
    const sourceKind = requiredString(row.sourceKind, "plugin source kind");
    if (sourceKind !== "builtin") throw new Error(`Unknown plugin source kind ${sourceKind}`);
    const id = requiredString(row.id, "system plugin id");
    const contentType = requiredString(row.imageContentType, "plugin image content type");
    if (contentType !== "image/png") throw new Error(`Unknown plugin image type ${contentType}`);
    const manifest = installedManifest(requiredString(row.manifestJson, "plugin manifest"));
    const mcp = manifest.mcp;
    return {
        id,
        displayName: requiredString(row.displayName, "plugin display name"),
        shortName: requiredString(row.shortName, "plugin short name"),
        description: requiredString(row.description, "plugin description"),
        sourceKind,
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
                              : mcp.container
                                ? ("bundled" as const)
                                : ("selection_required" as const),
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
