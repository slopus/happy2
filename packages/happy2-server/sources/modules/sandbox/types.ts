import type { Readable, Writable } from "node:stream";

export type SandboxProviderHealth = "healthy" | "unhealthy" | "unavailable" | "timed_out";

export interface SandboxProviderStatus {
    id: string;
    displayName: string;
    health: SandboxProviderHealth;
    detail: string;
    remediation?: string;
    version?: string;
}

export interface SandboxProbeOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface AgentImageBuildInput {
    buildContext?: string;
    dockerfile: string;
    tag: string;
}

export interface AgentImageBuildUpdate {
    logChunk: string;
    /** Best-effort completion percentage derived from provider build output. */
    progress?: number;
}

export interface AgentImageBuildOptions {
    onUpdate?: (update: AgentImageBuildUpdate) => void;
    signal?: AbortSignal;
}

export interface AgentSandboxCreateInput {
    agentUserId: string;
    configurationHash: string;
    containerName: string;
    homeDirectory: string;
    imageId: string;
    imageTag: string;
    security: {
        init: true;
        readonlyRootFilesystem: true;
        sharedMemoryBytes: number;
        tmpfs: ReadonlyArray<{ mode: number; target: string }>;
    };
    workspaceDirectory: string;
}

export interface AgentSandboxState {
    configurationHash?: string;
    running: boolean;
}

export interface SandboxFileIngressInput {
    containerName: string;
    destinationPath: string;
    sourcePath: string;
}

export interface SandboxFileEgressInput {
    containerName: string;
    destinationPath: string;
    sourcePath: string;
}

export interface SandboxTerminalInput {
    command?: readonly string[];
    containerName: string;
    environment?: Readonly<Record<string, string>>;
}

export interface PluginSandboxCreateInput {
    containerName: string;
    containerInstanceId: string;
    imageTag: string;
    installationId: string;
    workspaceDirectory: string;
    /** Numeric owner of the private host workspace bind mount. */
    workspaceGroupId: number;
    workspaceUserId: number;
}

export interface PluginSandboxState {
    containerInstanceId: string;
    installationId: string;
    running: boolean;
    /** Host workspace owner recorded when this container was created. */
    workspaceUser?: string;
}

export interface PluginSandboxCommandInput {
    command: readonly string[];
    containerName: string;
    environment: Readonly<Record<string, string>>;
}

export interface SandboxTerminalHandle {
    stderr: Readable;
    stdin: Writable;
    stdout: Readable;
    wait: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
    close(): void;
}

/** Minimal execution boundary consumed by the agent service and its deterministic test doubles. */
export interface AgentSandboxRuntime {
    buildImage(
        input: AgentImageBuildInput,
        options?: AgentImageBuildOptions,
    ): Promise<{ imageId: string }>;
    createSandbox(input: AgentSandboxCreateInput, signal?: AbortSignal): Promise<void>;
    /** Copies one server-staged file into the agent sandbox, creating its parent directory. */
    copyFileToSandbox(input: SandboxFileIngressInput, signal?: AbortSignal): Promise<void>;
    /** Reads the runtime-owned configuration identity for one agent container. */
    inspectAgentSandbox(
        containerName: string,
        signal?: AbortSignal,
    ): Promise<AgentSandboxState | undefined>;
    removeSandbox(containerName: string): Promise<void>;
    /** Resolves one fixed loopback-only host mapping for an agent container. */
    resolveSandboxPort?(
        containerName: string,
        containerPort: number,
        signal?: AbortSignal,
    ): Promise<{ host: "127.0.0.1"; port: number }>;
}

/** Complete provider contract shared by local OCI drivers and future remote sandbox vendors. */
export interface SandboxProvider extends AgentSandboxRuntime {
    readonly displayName: string;
    readonly id: string;
    readonly locality: "local" | "remote";
    attachTerminal(input: SandboxTerminalInput, signal?: AbortSignal): SandboxTerminalHandle;
    copyFileFromSandbox(input: SandboxFileEgressInput, signal?: AbortSignal): Promise<void>;
    copyFileToSandbox(input: SandboxFileIngressInput, signal?: AbortSignal): Promise<void>;
    /** Optional local-runtime capability used by installed stdio MCP plugins. */
    createPluginSandbox?(input: PluginSandboxCreateInput, signal?: AbortSignal): Promise<void>;
    inspectPluginSandbox?(
        containerName: string,
        signal?: AbortSignal,
    ): Promise<PluginSandboxState | undefined>;
    /** Starts the installation's one persistent command without coupling it to the server process. */
    startPluginCommand?(input: PluginSandboxCommandInput, signal?: AbortSignal): Promise<void>;
    /** Checks the persistent command marker maintained inside the installation container. */
    isPluginCommandRunning?(containerName: string, signal?: AbortSignal): Promise<boolean>;
    probe(options?: SandboxProbeOptions): Promise<SandboxProviderStatus>;
}

export type AgentSandboxRuntimeResolver = () => Promise<AgentSandboxRuntime>;
