import { pluginInstallations, plugins } from "../../schema.js";

export const pluginInstallationSelection = {
    id: pluginInstallations.id,
    pluginId: pluginInstallations.pluginId,
    shortName: plugins.shortName,
    sourceKind: plugins.sourceKind,
    sourceReference: plugins.sourceReference,
    sourceVersion: plugins.sourceVersion,
    packageDigest: plugins.packageDigest,
    grantedPermissionsJson: pluginInstallations.grantedPermissionsJson,
    containerImageId: pluginInstallations.containerImageId,
    status: pluginInstallations.status,
    statusDetail: pluginInstallations.statusDetail,
    lastError: pluginInstallations.lastError,
    installedByUserId: pluginInstallations.installedByUserId,
    installedAt: pluginInstallations.installedAt,
    updatedAt: pluginInstallations.updatedAt,
    readyAt: pluginInstallations.readyAt,
};
