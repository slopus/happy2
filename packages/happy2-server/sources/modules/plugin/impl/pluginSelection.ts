import { plugins } from "../../schema.js";

export const pluginSelection = {
    id: plugins.id,
    displayName: plugins.displayName,
    shortName: plugins.shortName,
    description: plugins.description,
    sourceKind: plugins.sourceKind,
    sourceReference: plugins.sourceReference,
    sourceVersion: plugins.sourceVersion,
    packageDigest: plugins.packageDigest,
    manifestJson: plugins.manifestJson,
    imageContentType: plugins.imageContentType,
    imageSize: plugins.imageSize,
    imageWidth: plugins.imageWidth,
    imageHeight: plugins.imageHeight,
    imageThumbhash: plugins.imageThumbhash,
    imageChecksumSha256: plugins.imageChecksumSha256,
    installedByUserId: plugins.installedByUserId,
    installedAt: plugins.installedAt,
    updatedAt: plugins.updatedAt,
};
