import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
    AgentSandboxRuntimeResolver,
    SandboxProvider,
    SandboxTerminalHandle,
} from "../sandbox/index.js";
import { PluginError } from "./types.js";
import { NdjsonStreamTransport } from "./utils/ndjsonStreamTransport.js";

export interface PluginLocalPrepareInput {
    build?: { contextDirectory: string; dockerfile: string; tag: string };
    containerName: string;
    imageTag: string;
    installationId: string;
}

export interface PluginLocalOpenInput {
    args: readonly string[];
    command: string;
    containerName: string;
    environment: Readonly<Record<string, string>>;
}

export interface PluginMcpRuntime {
    prepareLocal(
        input: PluginLocalPrepareInput,
        signal?: AbortSignal,
    ): Promise<{ imageTag: string }>;
    openLocal(input: PluginLocalOpenInput, signal?: AbortSignal): Promise<Transport>;
    removeLocal(containerName: string): Promise<void>;
}

/** Runs stdio MCP packages in dedicated containers owned by the selected local sandbox provider. */
export class SandboxPluginMcpRuntime implements PluginMcpRuntime {
    constructor(private readonly provider: AgentSandboxRuntimeResolver) {}

    async prepareLocal(
        input: PluginLocalPrepareInput,
        signal?: AbortSignal,
    ): Promise<{ imageTag: string }> {
        const provider = await this.localProvider();
        if (!provider.createPluginSandbox)
            throw new PluginError(
                "broken_configuration",
                `${provider.displayName} does not support plugin containers`,
            );
        if (input.build && input.build.tag !== input.imageTag)
            throw new Error("Plugin build and runtime image tags must match");
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
                imageTag: input.imageTag,
                installationId: input.installationId,
            },
            signal,
        );
        return { imageTag: input.imageTag };
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

    async removeLocal(containerName: string): Promise<void> {
        await (await this.localProvider()).removeSandbox(containerName);
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
                "Stdio MCP plugins require a local sandbox provider",
            );
        return provider;
    }
}
