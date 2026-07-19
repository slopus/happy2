export type PluginVariableKind = "secret" | "text";
export const MAX_PLUGIN_MCP_TOOLS = 1_024;
export type PluginInstallationStatus =
    | "preparing"
    | "starting"
    | "ready"
    | "broken_configuration"
    | "failed";

export interface PluginVariableDefinition {
    key: string;
    displayName: string;
    description: string;
    kind: PluginVariableKind;
}

export interface PluginStdioMcp {
    type: "stdio";
    command: string;
    args: string[];
    container?: { dockerfile: string };
}

export interface PluginRemoteMcp {
    type: "remote";
    url: string;
    headers: Readonly<Record<string, string>>;
}

export type PluginMcp = PluginStdioMcp | PluginRemoteMcp;

export type PluginHostPermission =
    | "channels:manage"
    | "chats:update"
    | "plugins:list"
    | "plugins:install"
    | "plugins:uninstall"
    | "plugins:request-install"
    | "plugins:request-uninstall";
export const pluginHostPermissions: readonly PluginHostPermission[] = [
    "channels:manage",
    "chats:update",
    "plugins:list",
    "plugins:install",
    "plugins:uninstall",
    "plugins:request-install",
    "plugins:request-uninstall",
];

export interface PluginApiPermissionDefinition {
    id: PluginHostPermission;
    displayName: string;
    description: string;
}

export interface PluginApiPermissionSection {
    id: "channels" | "chats" | "plugins";
    displayName: string;
    readOnly: PluginApiPermissionDefinition[];
    mutations: PluginApiPermissionDefinition[];
}
export interface PluginContainer {
    dockerfile?: string;
    command?: string;
    args: string[];
    permissions: PluginHostPermission[];
}

export type PluginSourceKind = "builtin" | "github" | "upload" | "zip_url" | "archive" | "link";

export type PluginSource = {
    [Kind in PluginSourceKind]: {
        kind: Kind;
        /** Stable identity used to reuse an installed package and to locate remote updates. */
        reference: string;
    };
}[PluginSourceKind];

export interface PluginManifest {
    schemaVersion: 1;
    version: string;
    displayName: string;
    shortName: string;
    description: string;
    variables: PluginVariableDefinition[];
    container?: PluginContainer;
    mcp?: PluginMcp;
}

export interface PluginSkillSummary {
    name: string;
    description: string;
    directory: string;
}

export interface PluginSkillDefinition {
    name: string;
    description: string;
    location: "durable";
}

export interface PluginImageMetadata {
    contentType: "image/png";
    size: number;
    width: number;
    height: number;
    thumbhash: string;
    checksumSha256: string;
}

export interface PluginPackage {
    manifest: PluginManifest;
    skills: PluginSkillSummary[];
    directory: string;
    iconPath: string;
    image: PluginImageMetadata;
    packageDigest: string;
    source: PluginSource;
}

export interface SystemPluginSummary {
    id: string;
    displayName: string;
    shortName: string;
    description: string;
    sourceKind: PluginSourceKind;
    sourceReference: string;
    sourceVersion: string;
    packageDigest: string;
    variables: PluginVariableDefinition[];
    mcp?: {
        type: "remote" | "stdio";
        container: "bundled" | "selection_required" | "none";
    };
    container?: {
        image: "bundled" | "selection_required";
        command: boolean;
    };
    apiPermissions: PluginApiPermissionSection[];
    image: PluginImageMetadata & { url: string };
    installedByUserId?: string;
    installedAt: string;
    updatedAt: string;
}

export interface PluginInstallationSummary {
    id: string;
    pluginId: string;
    shortName: string;
    sourceKind: PluginSourceKind;
    sourceReference: string;
    sourceVersion: string;
    packageDigest: string;
    grantedPermissions: PluginHostPermission[];
    status: PluginInstallationStatus;
    statusDetail?: string;
    lastError?: string;
    containerImageId?: string;
    installedByUserId?: string;
    installedAt: string;
    updatedAt: string;
    readyAt?: string;
}

export interface PluginFunctionDefinition {
    description: string;
    label: string;
    name: string;
    parameters: Readonly<Record<string, unknown>>;
}

export interface PluginAgentCallContext {
    actorUserId: string;
    agentUserId: string;
    callId: string;
    chatId: string;
    sessionId: string;
}

export type PluginManagementRequestStatus =
    | "pending"
    | "processing"
    | "approved"
    | "denied"
    | "failed";

export type PluginManagementRequestAction = "install" | "uninstall";

export interface PluginManagementRequestSummary {
    id: string;
    action: PluginManagementRequestAction;
    status: PluginManagementRequestStatus;
    chatId: string;
    agentUserId?: string;
    requesterInstallationId?: string;
    displayName: string;
    shortName: string;
    description: string;
    imageUrl?: string;
    reason?: string;
    sourceKind?: PluginSource["kind"];
    sourceReference?: string;
    targetInstallationId?: string;
    createdAt: string;
    resolvedAt?: string;
    resolvedByUserId?: string;
    installationId?: string;
    lastError?: string;
}

export interface PluginReferencedUser {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    kind: "human" | "agent";
    triggeredTurn: boolean;
}

export interface PluginCallContext {
    agentUserId: string;
    callId: string;
    chatId: string;
    sessionId: string;
    triggeredByUserId: string;
    users: readonly PluginReferencedUser[];
}

export interface PluginUserCapability {
    id: string;
    token: string;
}

export type PluginFunctionResult =
    | { status: "completed"; output?: unknown }
    | {
          status: "failed";
          error: { code?: string; data?: unknown; message: string };
      };

export interface PluginCatalogItem {
    displayName: string;
    shortName: string;
    description: string;
    version: string;
    packageDigest: string;
    iconUrl: string;
    skills: PluginSkillSummary[];
    mcp?: {
        type: "remote" | "stdio";
        container: "bundled" | "selection_required" | "none";
    };
    container?: {
        image: "bundled" | "selection_required";
        command: boolean;
    };
    apiPermissions: PluginApiPermissionSection[];
    variables: PluginVariableDefinition[];
    systemPlugin?: SystemPluginSummary & {
        updateAvailable: boolean;
        installations: PluginInstallationSummary[];
    };
}

export interface PluginMcpToolSummary {
    installationId: string;
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    syncedAt: string;
}

export interface PreparedPluginSummary {
    preparedToken: string;
    expiresAt: string;
    sourceKind: PluginSourceKind;
    sourceReference: string;
    packageDigest: string;
    version: string;
    displayName: string;
    shortName: string;
    description: string;
    skills: Array<Pick<PluginSkillSummary, "name" | "description">>;
    variables: PluginVariableDefinition[];
    apiPermissions: PluginApiPermissionSection[];
    mcp?: {
        type: "remote" | "stdio";
        container: "bundled" | "selection_required" | "none";
    };
    image: PluginImageMetadata;
}

export interface PluginUpdateCheck {
    pluginId: string;
    checkedAt: string;
    updateAvailable: boolean;
    installed: { version: string; packageDigest: string };
    remote: { version: string; packageDigest: string };
}

interface PluginRuntimePackage {
    installationId: string;
    pluginId: string;
    shortName: string;
    packageDirectory: string;
    packageDigest: string;
}

export type PluginRuntimeConfiguration = PluginRuntimePackage &
    (
        | {
              type: "local";
              command?: { command: string; args: string[] };
              mcp?: { command: string; args: string[] };
              environment: Readonly<Record<string, string>>;
              containerName: string;
              containerInstanceId?: string;
              imageTag: string;
              bundledDockerfile?: string;
              permissions: PluginHostPermission[];
          }
        | {
              type: "remote";
              url: string;
              headers: Readonly<Record<string, string>>;
          }
        | {
              type: "skills_only";
          }
    );

export class PluginError extends Error {
    constructor(
        readonly code:
            | "broken_configuration"
            | "conflict"
            | "forbidden"
            | "invalid_package"
            | "not_found"
            | "not_ready"
            | "unsupported_source",
        message: string,
    ) {
        super(message);
        this.name = "PluginError";
    }
}
