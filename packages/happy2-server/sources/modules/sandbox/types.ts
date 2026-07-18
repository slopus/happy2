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
    imageTag: string;
    installationId: string;
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
    removeSandbox(containerName: string): Promise<void>;
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
    probe(options?: SandboxProbeOptions): Promise<SandboxProviderStatus>;
}

export type AgentSandboxRuntimeResolver = () => Promise<AgentSandboxRuntime>;
