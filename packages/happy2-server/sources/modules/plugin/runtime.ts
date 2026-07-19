import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
    AgentSandboxRuntimeResolver,
    SandboxProvider,
    SandboxTerminalHandle,
} from "../sandbox/index.js";
import { PluginError } from "./types.js";
import { NdjsonStreamTransport } from "./utils/ndjsonStreamTransport.js";

const COMMAND_MONITOR_STARTUP_CHECKS = 20;
const COMMAND_MONITOR_STARTUP_INTERVAL_MS = 50;
const COMMAND_MONITOR_STEADY_INTERVAL_MS = 5_000;

export interface PluginLocalPrepareInput {
    build?: { contextDirectory: string; dockerfile: string; tag: string };
    containerName: string;
    imageTag: string;
    installationId: string;
    containerInstanceId: string;
    existingContainerInstanceId?: string;
    workspaceDirectory: string;
}

export interface PluginLocalOpenInput {
    args: readonly string[];
    command: string;
    containerName: string;
    environment: Readonly<Record<string, string>>;
}

export interface PluginLocalCommandHandle {
    wait: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
    close(): void;
}

export interface PluginMcpRuntime {
    prepareLocal(
        input: PluginLocalPrepareInput,
        signal?: AbortSignal,
    ): Promise<{ containerInstanceId: string; imageTag: string; reused: boolean }>;
    startLocalCommand(
        input: PluginLocalOpenInput,
        signal?: AbortSignal,
    ): Promise<PluginLocalCommandHandle>;
    monitorLocalCommand(
        containerName: string,
        signal?: AbortSignal,
    ): Promise<PluginLocalCommandHandle>;
    openLocal(input: PluginLocalOpenInput, signal?: AbortSignal): Promise<Transport>;
    isLocalRunning?(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean>;
    removeLocal(containerName: string): Promise<void>;
}

/** Runs stdio MCP packages in dedicated containers owned by the selected local sandbox provider. */
export class SandboxPluginMcpRuntime implements PluginMcpRuntime {
    constructor(private readonly provider: AgentSandboxRuntimeResolver) {}

    async prepareLocal(
        input: PluginLocalPrepareInput,
        signal?: AbortSignal,
    ): Promise<{ containerInstanceId: string; imageTag: string; reused: boolean }> {
        const provider = await this.localProvider();
        if (!provider.createPluginSandbox)
            throw new PluginError(
                "broken_configuration",
                `${provider.displayName} does not support plugin containers`,
            );
        if (input.build && input.build.tag !== input.imageTag)
            throw new Error("Plugin build and runtime image tags must match");
        const existing = await provider.inspectPluginSandbox?.(input.containerName, signal);
        if (
            existing?.running &&
            existing.installationId === input.installationId &&
            existing.containerInstanceId === input.existingContainerInstanceId
        )
            return {
                containerInstanceId: existing.containerInstanceId,
                imageTag: input.imageTag,
                reused: true,
            };
        await provider.removeSandbox(input.containerName);
        if (input.build)
            await provider.buildImage(
                {
                    buildContext: input.build.contextDirectory,
                    dockerfile: input.build.dockerfile,
                    tag: input.build.tag,
                },
                { signal },
            );
        await provider.createPluginSandbox(
            {
                containerName: input.containerName,
                containerInstanceId: input.containerInstanceId,
                imageTag: input.imageTag,
                installationId: input.installationId,
                workspaceDirectory: input.workspaceDirectory,
            },
            signal,
        );
        return {
            containerInstanceId: input.containerInstanceId,
            imageTag: input.imageTag,
            reused: false,
        };
    }

    async openLocal(input: PluginLocalOpenInput, signal?: AbortSignal): Promise<Transport> {
        const provider = await this.localProvider();
        let handle: SandboxTerminalHandle;
        try {
            handle = provider.attachTerminal(
                {
                    containerName: input.containerName,
                    command: [input.command, ...input.args],
                    environment: input.environment,
                },
                signal,
            );
        } catch (error) {
            throw new PluginError(
                "broken_configuration",
                error instanceof Error ? error.message : "Plugin environment is invalid",
            );
        }
        return new NdjsonStreamTransport(handle);
    }

    async startLocalCommand(
        input: PluginLocalOpenInput,
        signal?: AbortSignal,
    ): Promise<PluginLocalCommandHandle> {
        const provider = await this.localProvider();
        if (!provider.startPluginCommand)
            throw new PluginError(
                "broken_configuration",
                `${provider.displayName} does not support persistent plugin commands`,
            );
        try {
            await provider.startPluginCommand(
                {
                    containerName: input.containerName,
                    command: [input.command, ...input.args],
                    environment: input.environment,
                },
                signal,
            );
            return await this.monitorLocalCommand(input.containerName, signal);
        } catch (error) {
            throw new PluginError(
                "broken_configuration",
                error instanceof Error ? error.message : "Plugin command could not start",
            );
        }
    }

    async monitorLocalCommand(
        containerName: string,
        signal?: AbortSignal,
    ): Promise<PluginLocalCommandHandle> {
        const provider = await this.localProvider();
        if (!provider.isPluginCommandRunning)
            throw new PluginError(
                "broken_configuration",
                `${provider.displayName} cannot monitor persistent plugin commands`,
            );
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        const wait = monitorPluginCommand(provider, containerName, controller.signal).finally(() =>
            signal?.removeEventListener("abort", abort),
        );
        return {
            wait,
            close: () => controller.abort(),
        };
    }

    async removeLocal(containerName: string): Promise<void> {
        await (await this.localProvider()).removeSandbox(containerName);
    }

    async isLocalRunning(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean> {
        const state = await (await this.localProvider()).inspectPluginSandbox?.(containerName);
        return Boolean(
            state?.running &&
            state.installationId === installationId &&
            state.containerInstanceId === containerInstanceId,
        );
    }

    private async localProvider(): Promise<SandboxProvider> {
        let provider: SandboxProvider;
        try {
            provider = (await this.provider()) as SandboxProvider;
        } catch (error) {
            throw new PluginError(
                "broken_configuration",
                error instanceof Error
                    ? error.message
                    : "A local sandbox provider is not configured",
            );
        }
        if (provider.locality !== "local")
            throw new PluginError(
                "broken_configuration",
                "Container plugins require a local sandbox provider",
            );
        return provider;
    }
}

async function monitorPluginCommand(
    provider: SandboxProvider,
    containerName: string,
    signal: AbortSignal,
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    let completedChecks = 0;
    while (!signal.aborted) {
        try {
            if (!(await provider.isPluginCommandRunning!(containerName, signal)))
                return { exitCode: null, signal: null };
        } catch {
            if (signal.aborted) break;
            // A temporary OCI daemon failure must not revoke a still-running incarnation.
        }
        completedChecks += 1;
        await monitorDelay(
            signal,
            completedChecks < COMMAND_MONITOR_STARTUP_CHECKS
                ? COMMAND_MONITOR_STARTUP_INTERVAL_MS
                : COMMAND_MONITOR_STEADY_INTERVAL_MS,
        );
    }
    return { exitCode: null, signal: "SIGTERM" };
}

function monitorDelay(signal: AbortSignal, milliseconds: number): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
        const timeout = setTimeout(finish, milliseconds);
        const abort = () => finish();
        function finish() {
            clearTimeout(timeout);
            signal.removeEventListener("abort", abort);
            resolve();
        }
        signal.addEventListener("abort", abort, { once: true });
    });
}
