import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { SetupStoreBinding } from "./setupStore.js";
import type { SetupOutput } from "./setupTypes.js";

export interface SetupActionContext {
    readonly runtime: StateRuntime;
    readonly setup: SetupStoreBinding;
}

const statusGenerations = new WeakMap<SetupStoreBinding, number>();
const providerGenerations = new WeakMap<SetupStoreBinding, number>();
const baseImageGenerations = new WeakMap<SetupStoreBinding, number>();

function nextGeneration(map: WeakMap<SetupStoreBinding, number>, setup: SetupStoreBinding): number {
    const generation = (map.get(setup) ?? 0) + 1;
    map.set(setup, generation);
    return generation;
}

/** Loads the durable combined onboarding status that authoritatively drives every route guard. */
export async function setupStatusLoad(context: SetupActionContext): Promise<void> {
    const generation = nextGeneration(statusGenerations, context.setup);
    context.setup.setupInput({ type: "statusLoading" });
    try {
        const status = await context.runtime.operation("getSetup");
        if (statusGenerations.get(context.setup) !== generation) return;
        context.setup.setupInput({ type: "statusLoaded", status });
    } catch (error) {
        if (statusGenerations.get(context.setup) === generation)
            context.setup.setupInput({ type: "statusFailed", error: userError(error) });
    }
}

/** Freshly probes and loads the sandbox providers with their displayable health and remediation. */
export async function setupSandboxProvidersLoad(context: SetupActionContext): Promise<void> {
    const generation = nextGeneration(providerGenerations, context.setup);
    context.setup.setupInput({ type: "providersLoading" });
    try {
        const providers = await context.runtime.operation("getSetupSandboxProviders");
        if (providerGenerations.get(context.setup) !== generation) return;
        context.setup.setupInput({ type: "providersLoaded", providers });
    } catch (error) {
        if (providerGenerations.get(context.setup) === generation)
            context.setup.setupInput({ type: "providersFailed", error: userError(error) });
    }
}

/** Loads the base-image catalog and the selected image's complete durable build output. */
export async function setupBaseImagesLoad(context: SetupActionContext): Promise<void> {
    const generation = nextGeneration(baseImageGenerations, context.setup);
    context.setup.setupInput({ type: "baseImagesLoading" });
    try {
        const baseImages = await context.runtime.operation("getSetupBaseImages");
        if (baseImageGenerations.get(context.setup) !== generation) return;
        context.setup.setupInput({ type: "baseImagesLoaded", baseImages });
    } catch (error) {
        if (baseImageGenerations.get(context.setup) === generation)
            context.setup.setupInput({ type: "baseImagesFailed", error: userError(error) });
    }
}

/**
 * Reconciles the setup surface after a realtime hint. The combined status is
 * always reloaded because it is the routing authority; the sub-resources reload
 * only when already materialized so a background hint never fetches a screen the
 * administrator is not on.
 */
export async function setupReconcile(context: SetupActionContext): Promise<void> {
    const snapshot = context.setup.store.get();
    await setupStatusLoad(context);
    const followUps: Promise<void>[] = [];
    if (snapshot.providers.type !== "unloaded") followUps.push(setupSandboxProvidersLoad(context));
    if (snapshot.baseImages.type !== "unloaded") followUps.push(setupBaseImagesLoad(context));
    await Promise.all(followUps);
}

/** Executes one typed onboarding command and reconciles the authoritative status it returns. */
export async function setupOutputRoute(
    context: SetupActionContext,
    event: SetupOutput,
): Promise<void> {
    try {
        if (event.type === "sandboxProviderSelectSubmitted") {
            const result = await context.runtime.operation("selectSetupSandboxProvider", {
                providerId: event.providerId,
            });
            statusGenerations.set(context.setup, nextGeneration(statusGenerations, context.setup));
            context.setup.setupInput({
                type: "sandboxProviderSelectSucceeded",
                status: result.onboarding,
                provider: result.provider,
            });
        } else if (event.type === "baseImageSelectSubmitted") {
            const result = await context.runtime.operation("selectSetupBaseImage", event.selection);
            statusGenerations.set(context.setup, nextGeneration(statusGenerations, context.setup));
            baseImageGenerations.set(
                context.setup,
                nextGeneration(baseImageGenerations, context.setup),
            );
            context.setup.setupInput({
                type: "baseImageSelectSucceeded",
                status: result.onboarding,
                baseImages: result.baseImages,
            });
        } else if (event.type === "baseImageBuildRetrySubmitted") {
            const result = await context.runtime.operation("retrySetupBaseImageBuild", {});
            statusGenerations.set(context.setup, nextGeneration(statusGenerations, context.setup));
            baseImageGenerations.set(
                context.setup,
                nextGeneration(baseImageGenerations, context.setup),
            );
            context.setup.setupInput({
                type: "baseImageBuildRetrySucceeded",
                status: result.onboarding,
                baseImages: result.baseImages,
            });
        } else {
            const result = await context.runtime.operation("chooseSetupRegistrationPolicy", {
                enabled: event.enabled,
            });
            statusGenerations.set(context.setup, nextGeneration(statusGenerations, context.setup));
            context.setup.setupInput({
                type: "registrationPolicyChooseSucceeded",
                status: result.onboarding,
            });
        }
    } catch (error) {
        const displayable = userError(error);
        if (event.type === "sandboxProviderSelectSubmitted") {
            context.setup.setupInput({
                type: "actionFailed",
                action: "sandboxProvider",
                error: displayable,
            });
            // A conflict means the provider probe changed; refresh displayable health.
            await setupSandboxProvidersLoad(context);
        } else if (event.type === "baseImageSelectSubmitted") {
            context.setup.setupInput({
                type: "actionFailed",
                action: "baseImageSelect",
                error: displayable,
            });
        } else if (event.type === "baseImageBuildRetrySubmitted") {
            context.setup.setupInput({
                type: "actionFailed",
                action: "baseImageRetry",
                error: displayable,
            });
        } else {
            context.setup.setupInput({
                type: "actionFailed",
                action: "policy",
                error: displayable,
            });
        }
    }
}
