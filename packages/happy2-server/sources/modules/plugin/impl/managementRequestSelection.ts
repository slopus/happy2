import { pluginManagementRequests } from "../../schema.js";

export const pluginManagementRequestSelection = {
    id: pluginManagementRequests.id,
    action: pluginManagementRequests.action,
    status: pluginManagementRequests.status,
    chatId: pluginManagementRequests.chatId,
    agentUserId: pluginManagementRequests.agentUserId,
    requesterInstallationId: pluginManagementRequests.requesterInstallationId,
    displayName: pluginManagementRequests.displayName,
    shortName: pluginManagementRequests.shortName,
    description: pluginManagementRequests.description,
    reason: pluginManagementRequests.reason,
    sourceKind: pluginManagementRequests.sourceKind,
    sourceReference: pluginManagementRequests.sourceReference,
    targetInstallationId: pluginManagementRequests.targetInstallationId,
    installationId: pluginManagementRequests.installationId,
    resolvedByUserId: pluginManagementRequests.resolvedByUserId,
    resolvedAt: pluginManagementRequests.resolvedAt,
    lastError: pluginManagementRequests.lastError,
    createdAt: pluginManagementRequests.createdAt,
};
