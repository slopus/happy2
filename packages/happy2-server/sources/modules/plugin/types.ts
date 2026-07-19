export type PluginVariableKind = "secret" | "text";
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

export interface PluginManifest {
    schemaVersion: 1;
    version: string;
    displayName: string;
    shortName: string;
    description: string;
    variables: PluginVariableDefinition[];
    mcp?: PluginMcp;
}

export interface PluginSkillSummary {
    name: string;
    description: string;
    directory: string;
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
    source: { kind: "builtin"; reference: string };
}

export interface SystemPluginSummary {
    id: string;
    displayName: string;
    shortName: string;
    description: string;
    sourceKind: "builtin";
    sourceReference: string;
    sourceVersion: string;
    packageDigest: string;
    variables: PluginVariableDefinition[];
    mcp?: {
        type: "remote" | "stdio";
        container: "bundled" | "selection_required" | "none";
    };
    image: PluginImageMetadata & { url: string };
    installedByUserId?: string;
    installedAt: string;
    updatedAt: string;
}

export interface PluginInstallationSummary {
    id: string;
    pluginId: string;
    shortName: string;
    sourceKind: "builtin";
    sourceReference: string;
    sourceVersion: string;
    packageDigest: string;
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
    variables: PluginVariableDefinition[];
    systemPlugin?: SystemPluginSummary & {
        updateAvailable: boolean;
        installations: PluginInstallationSummary[];
    };
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
              type: "stdio";
              command: string;
              args: string[];
              environment: Readonly<Record<string, string>>;
              containerName: string;
              imageTag: string;
              bundledDockerfile?: string;
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
        readonly code: "broken_configuration" | "forbidden" | "not_found" | "not_ready",
        message: string,
    ) {
        super(message);
        this.name = "PluginError";
    }
}
