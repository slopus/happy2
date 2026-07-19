import type {
    PluginManagementRequestAction,
    PluginManagementRequestStatus,
    PluginManagementRequestSummary,
} from "../types.js";

const actions: readonly PluginManagementRequestAction[] = ["install", "uninstall"];
const statuses: readonly PluginManagementRequestStatus[] = [
    "pending",
    "processing",
    "approved",
    "denied",
    "failed",
];

export function asPluginManagementRequest(
    row: Record<string, unknown>,
): PluginManagementRequestSummary {
    const id = requiredString(row.id, "plugin management request id");
    const chatId = requiredString(row.chatId, "plugin management request chat id");
    const action = requiredString(row.action, "plugin management request action");
    const status = requiredString(row.status, "plugin management request status");
    if (!actions.includes(action as PluginManagementRequestAction))
        throw new Error(`Unknown plugin management request action ${action}`);
    if (!statuses.includes(status as PluginManagementRequestStatus))
        throw new Error(`Unknown plugin management request status ${status}`);
    const rawSourceKind = optionalString(row.sourceKind);
    const sourceKind: "archive" | "builtin" | "link" | undefined =
        rawSourceKind === "archive" || rawSourceKind === "builtin" || rawSourceKind === "link"
            ? rawSourceKind
            : undefined;
    if (rawSourceKind && !sourceKind)
        throw new Error(`Unknown requested plugin source kind ${rawSourceKind}`);
    return {
        id,
        action: action as PluginManagementRequestAction,
        status: status as PluginManagementRequestStatus,
        chatId,
        ...(optionalString(row.agentUserId)
            ? { agentUserId: optionalString(row.agentUserId) }
            : {}),
        ...(optionalString(row.requesterInstallationId)
            ? { requesterInstallationId: optionalString(row.requesterInstallationId) }
            : {}),
        displayName: requiredString(row.displayName, "plugin display name"),
        shortName: requiredString(row.shortName, "plugin short name"),
        description: requiredString(row.description, "plugin description"),
        ...(status === "pending" || status === "processing"
            ? { imageUrl: `/v0/chats/${chatId}/pluginManagementRequests/${id}/image` }
            : {}),
        ...(optionalString(row.reason) ? { reason: optionalString(row.reason) } : {}),
        ...(sourceKind ? { sourceKind } : {}),
        ...(optionalString(row.sourceReference)
            ? { sourceReference: optionalString(row.sourceReference) }
            : {}),
        ...(optionalString(row.targetInstallationId)
            ? { targetInstallationId: optionalString(row.targetInstallationId) }
            : {}),
        createdAt: requiredString(row.createdAt, "plugin request creation timestamp"),
        ...(optionalString(row.resolvedAt) ? { resolvedAt: optionalString(row.resolvedAt) } : {}),
        ...(optionalString(row.resolvedByUserId)
            ? { resolvedByUserId: optionalString(row.resolvedByUserId) }
            : {}),
        ...(optionalString(row.installationId)
            ? { installationId: optionalString(row.installationId) }
            : {}),
        ...(optionalString(row.lastError) ? { lastError: optionalString(row.lastError) } : {}),
    };
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value) throw new Error(`Invalid ${name}`);
    return value;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}
