import type { SandboxProbeOptions, SandboxProvider, SandboxProviderStatus } from "./types.js";

export const SANDBOX_EXECUTION_NOTICE =
    "Happy runs agent code inside the selected sandbox provider, isolated from the Happy server process.";

export interface SandboxProviderDiscovery {
    executionNotice: string;
    providers: SandboxProviderStatus[];
    recommendedProviderId?: string;
}

/** Immutable provider lookup and discovery boundary; durable selection remains owned by setup actions. */
export class SandboxProviderCatalog {
    private readonly byId: ReadonlyMap<string, SandboxProvider>;

    constructor(providers: readonly SandboxProvider[]) {
        const byId = new Map<string, SandboxProvider>();
        for (const provider of providers) {
            if (!/^[a-z][a-z0-9_-]{0,63}$/.test(provider.id))
                throw new Error(`Invalid sandbox provider id ${provider.id}`);
            if (byId.has(provider.id))
                throw new Error(`Duplicate sandbox provider id ${provider.id}`);
            byId.set(provider.id, provider);
        }
        if (byId.size === 0) throw new Error("At least one sandbox provider must be registered");
        this.byId = byId;
    }

    get(id: string): SandboxProvider | undefined {
        return this.byId.get(id);
    }

    async discover(options: SandboxProbeOptions = {}): Promise<SandboxProviderDiscovery> {
        const providers = await Promise.all(
            [...this.byId.values()].map((provider) => provider.probe(options)),
        );
        const healthy = providers.filter(({ health }) => health === "healthy");
        return {
            executionNotice: SANDBOX_EXECUTION_NOTICE,
            providers,
            ...(healthy.length === 1 ? { recommendedProviderId: healthy[0]!.id } : {}),
        };
    }
}
