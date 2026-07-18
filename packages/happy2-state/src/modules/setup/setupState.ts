import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type CombinedOnboardingStatus,
    type SandboxProviderDiscovery,
    type SandboxProviderStatus,
    type SetupBaseImageSelection,
    type SetupBaseImagesView,
} from "../../resources.js";
import { type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface SetupActionContext {
    readonly runtime: StateRuntime;
    readonly setup: SetupStore;
}

const statusGenerations = new WeakMap<SetupStore, number>();

const providerGenerations = new WeakMap<SetupStore, number>();

const baseImageGenerations = new WeakMap<SetupStore, number>();

function nextGeneration(map: WeakMap<SetupStore, number>, setup: SetupStore): number {
    const generation = (map.get(setup) ?? 0) + 1;
    map.set(setup, generation);
    return generation;
}

/** Loads the durable combined onboarding status that authoritatively drives every route guard. */
export async function setupStatusLoad(context: SetupActionContext): Promise<void> {
    const generation = nextGeneration(statusGenerations, context.setup);
    context.setup.getState().setupInput({ type: "statusLoading" });
    try {
        const status = await context.runtime.operation("getSetup");
        if (statusGenerations.get(context.setup) !== generation) return;
        context.setup.getState().setupInput({ type: "statusLoaded", status });
    } catch (error) {
        if (statusGenerations.get(context.setup) === generation)
            context.setup.getState().setupInput({ type: "statusFailed", error: userError(error) });
    }
}

/** Freshly probes and loads the sandbox providers with their displayable health and remediation. */
export async function setupSandboxProvidersLoad(context: SetupActionContext): Promise<void> {
    const generation = nextGeneration(providerGenerations, context.setup);
    context.setup.getState().setupInput({ type: "providersLoading" });
    try {
        const providers = await context.runtime.operation("getSetupSandboxProviders");
        if (providerGenerations.get(context.setup) !== generation) return;
        context.setup.getState().setupInput({ type: "providersLoaded", providers });
    } catch (error) {
        if (providerGenerations.get(context.setup) === generation)
            context.setup
                .getState()
                .setupInput({ type: "providersFailed", error: userError(error) });
    }
}

/** Loads the base-image catalog and the selected image's complete durable build output. */
export async function setupBaseImagesLoad(context: SetupActionContext): Promise<void> {
    const generation = nextGeneration(baseImageGenerations, context.setup);
    context.setup.getState().setupInput({ type: "baseImagesLoading" });
    try {
        const baseImages = await context.runtime.operation("getSetupBaseImages");
        if (baseImageGenerations.get(context.setup) !== generation) return;
        context.setup.getState().setupInput({ type: "baseImagesLoaded", baseImages });
    } catch (error) {
        if (baseImageGenerations.get(context.setup) === generation)
            context.setup
                .getState()
                .setupInput({ type: "baseImagesFailed", error: userError(error) });
    }
}

/**
 * Reconciles the setup surface after a realtime hint. The combined status is
 * always reloaded because it is the routing authority; the sub-resources reload
 * only when already materialized so a background hint never fetches a screen the
 * administrator is not on.
 */
export async function setupReconcile(context: SetupActionContext): Promise<void> {
    const snapshot = context.setup.getState();
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
            context.setup.getState().setupInput({
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
            context.setup.getState().setupInput({
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
            context.setup.getState().setupInput({
                type: "baseImageBuildRetrySucceeded",
                status: result.onboarding,
                baseImages: result.baseImages,
            });
        } else if (event.type === "defaultAgentCreateSubmitted") {
            const result = await context.runtime.operation("createDefaultAgent", {
                name: event.name,
                username: event.username,
            });
            statusGenerations.set(context.setup, nextGeneration(statusGenerations, context.setup));
            context.setup.getState().setupInput({
                type: "defaultAgentCreateSucceeded",
                status: result.onboarding,
            });
        } else {
            const result = await context.runtime.operation("chooseSetupRegistrationPolicy", {
                enabled: event.enabled,
            });
            statusGenerations.set(context.setup, nextGeneration(statusGenerations, context.setup));
            context.setup.getState().setupInput({
                type: "registrationPolicyChooseSucceeded",
                status: result.onboarding,
            });
        }
    } catch (error) {
        const displayable = userError(error);
        if (event.type === "sandboxProviderSelectSubmitted") {
            context.setup.getState().setupInput({
                type: "actionFailed",
                action: "sandboxProvider",
                error: displayable,
            });
            // A conflict means the provider probe changed; refresh displayable health.
            await setupSandboxProvidersLoad(context);
        } else if (event.type === "baseImageSelectSubmitted") {
            context.setup.getState().setupInput({
                type: "actionFailed",
                action: "baseImageSelect",
                error: displayable,
            });
        } else if (event.type === "baseImageBuildRetrySubmitted") {
            context.setup.getState().setupInput({
                type: "actionFailed",
                action: "baseImageRetry",
                error: displayable,
            });
        } else if (event.type === "defaultAgentCreateSubmitted") {
            context.setup.getState().setupInput({
                type: "actionFailed",
                action: "defaultAgent",
                error: displayable,
            });
        } else {
            context.setup.getState().setupInput({
                type: "actionFailed",
                action: "policy",
                error: displayable,
            });
        }
    }
}

const idlePending: SetupPending = {
    selectingImage: false,
    retryingBuild: false,
    creatingDefaultAgent: false,
};

/**
 * Creates the single onboarding surface store. It retains the durable combined
 * status alongside the sandbox-provider and base-image sub-resources so one
 * coarse subscription drives every centered setup screen, and it keeps in-flight
 * command state locally so a transient failure never discards typed form intent.
 */
export function setupStoreCreate(
    output: (event: SetupOutput) => void = () => undefined,
): SetupStore {
    return createStore<SetupState>()((set, get) => ({
        status: { type: "unloaded" },
        providers: { type: "unloaded" },
        baseImages: { type: "unloaded" },
        pending: idlePending,

        sandboxProviderSelect(providerId): void {
            if (get().pending.selectingProviderId !== undefined) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, selectingProviderId: providerId },
                actionError: undefined,
                actionErrorFor: undefined,
            }));
            output({ type: "sandboxProviderSelectSubmitted", providerId });
        },
        baseImageSelect(selection): void {
            if (get().pending.selectingImage) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, selectingImage: true },
                actionError: undefined,
                actionErrorFor: undefined,
            }));
            output({ type: "baseImageSelectSubmitted", selection });
        },
        baseImageBuildRetry(): void {
            if (get().pending.retryingBuild) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, retryingBuild: true },
                actionError: undefined,
                actionErrorFor: undefined,
            }));
            output({ type: "baseImageBuildRetrySubmitted" });
        },
        defaultAgentCreate(input): void {
            if (get().pending.creatingDefaultAgent) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, creatingDefaultAgent: true },
                actionError: undefined,
                actionErrorFor: undefined,
            }));
            output({
                type: "defaultAgentCreateSubmitted",
                name: input.name,
                username: input.username,
            });
        },
        registrationPolicyChoose(enabled): void {
            if (get().pending.choosingPolicy !== undefined) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, choosingPolicy: enabled },
                actionError: undefined,
                actionErrorFor: undefined,
            }));
            output({ type: "registrationPolicyChooseSubmitted", enabled });
        },
        setupInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "statusLoading":
                        return snapshot.status.type === "ready"
                            ? snapshot
                            : { ...snapshot, status: { type: "loading" } };
                    case "statusLoaded":
                        return { ...snapshot, status: { type: "ready", value: event.status } };
                    case "statusFailed":
                        return snapshot.status.type === "ready"
                            ? snapshot
                            : { ...snapshot, status: { type: "error", error: event.error } };
                    case "providersLoading":
                        return snapshot.providers.type === "ready"
                            ? snapshot
                            : { ...snapshot, providers: { type: "loading" } };
                    case "providersLoaded":
                        return {
                            ...snapshot,
                            providers: { type: "ready", value: event.providers },
                        };
                    case "providersFailed":
                        return snapshot.providers.type === "ready"
                            ? snapshot
                            : { ...snapshot, providers: { type: "error", error: event.error } };
                    case "baseImagesLoading":
                        return snapshot.baseImages.type === "ready"
                            ? snapshot
                            : { ...snapshot, baseImages: { type: "loading" } };
                    case "baseImagesLoaded":
                        return {
                            ...snapshot,
                            baseImages: { type: "ready", value: event.baseImages },
                        };
                    case "baseImagesFailed":
                        return snapshot.baseImages.type === "ready"
                            ? snapshot
                            : { ...snapshot, baseImages: { type: "error", error: event.error } };
                    case "sandboxProviderSelectSucceeded": {
                        const providers =
                            snapshot.providers.type === "ready"
                                ? {
                                      type: "ready" as const,
                                      value: {
                                          ...snapshot.providers.value,
                                          selectedProviderId: event.provider.id,
                                      },
                                  }
                                : snapshot.providers;
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            providers,
                            pending: { ...snapshot.pending, selectingProviderId: undefined },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    }
                    case "baseImageSelectSucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            baseImages: { type: "ready", value: event.baseImages },
                            pending: { ...snapshot.pending, selectingImage: false },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "baseImageBuildRetrySucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            baseImages: { type: "ready", value: event.baseImages },
                            pending: { ...snapshot.pending, retryingBuild: false },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "defaultAgentCreateSucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            pending: { ...snapshot.pending, creatingDefaultAgent: false },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "registrationPolicyChooseSucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            pending: { ...snapshot.pending, choosingPolicy: undefined },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "actionFailed":
                        return {
                            ...snapshot,
                            pending: clearPending(snapshot.pending, event.action),
                            actionError: event.error,
                            actionErrorFor: event.action,
                        };
                }
            });
        },
    }));
}

function clearPending(pending: SetupPending, action: SetupAction): SetupPending {
    switch (action) {
        case "sandboxProvider":
            return { ...pending, selectingProviderId: undefined };
        case "baseImageSelect":
            return { ...pending, selectingImage: false };
        case "baseImageRetry":
            return { ...pending, retryingBuild: false };
        case "defaultAgent":
            return { ...pending, creatingDefaultAgent: false };
        case "policy":
            return { ...pending, choosingPolicy: undefined };
    }
}

/** Durable onboarding action names, used to attribute an in-flight command and its failure. */
export type SetupAction =
    | "sandboxProvider"
    | "baseImageSelect"
    | "baseImageRetry"
    | "defaultAgent"
    | "policy";

export interface SetupPending {
    /** The sandbox provider id whose selection probe is in flight, if any. */
    readonly selectingProviderId?: string;
    readonly selectingImage: boolean;
    readonly retryingBuild: boolean;
    /** True while the required default-agent creation request is in flight. */
    readonly creatingDefaultAgent: boolean;
    /** The registration policy value being committed, if a choice is in flight. */
    readonly choosingPolicy?: boolean;
}

export interface SetupSnapshot {
    readonly status: Loadable<CombinedOnboardingStatus>;
    readonly providers: Loadable<SandboxProviderDiscovery>;
    readonly baseImages: Loadable<SetupBaseImagesView>;
    readonly pending: SetupPending;
    /** The last displayable action failure, cleared when a new action starts. */
    readonly actionError?: UserError;
    /** The action the current `actionError` belongs to, so a surface can place it. */
    readonly actionErrorFor?: SetupAction;
}

export type SetupOutput =
    | { readonly type: "sandboxProviderSelectSubmitted"; readonly providerId: string }
    | { readonly type: "baseImageSelectSubmitted"; readonly selection: SetupBaseImageSelection }
    | { readonly type: "baseImageBuildRetrySubmitted" }
    | {
          readonly type: "defaultAgentCreateSubmitted";
          readonly name: string;
          readonly username: string;
      }
    | { readonly type: "registrationPolicyChooseSubmitted"; readonly enabled: boolean };

export type SetupInput =
    | { readonly type: "statusLoading" }
    | { readonly type: "statusLoaded"; readonly status: CombinedOnboardingStatus }
    | { readonly type: "statusFailed"; readonly error: UserError }
    | { readonly type: "providersLoading" }
    | { readonly type: "providersLoaded"; readonly providers: SandboxProviderDiscovery }
    | { readonly type: "providersFailed"; readonly error: UserError }
    | { readonly type: "baseImagesLoading" }
    | { readonly type: "baseImagesLoaded"; readonly baseImages: SetupBaseImagesView }
    | { readonly type: "baseImagesFailed"; readonly error: UserError }
    | {
          readonly type: "sandboxProviderSelectSucceeded";
          readonly status: CombinedOnboardingStatus;
          readonly provider: SandboxProviderStatus;
      }
    | {
          readonly type: "baseImageSelectSucceeded";
          readonly status: CombinedOnboardingStatus;
          readonly baseImages: SetupBaseImagesView;
      }
    | {
          readonly type: "baseImageBuildRetrySucceeded";
          readonly status: CombinedOnboardingStatus;
          readonly baseImages: SetupBaseImagesView;
      }
    | {
          readonly type: "defaultAgentCreateSucceeded";
          readonly status: CombinedOnboardingStatus;
      }
    | {
          readonly type: "registrationPolicyChooseSucceeded";
          readonly status: CombinedOnboardingStatus;
      }
    | { readonly type: "actionFailed"; readonly action: SetupAction; readonly error: UserError };

export interface SetupState extends SetupSnapshot {
    /** Probe and durably select a sandbox provider; a conflict refreshes provider health. */
    sandboxProviderSelect(providerId: string): void;
    /** Start (or reuse) the durable base-image build for the chosen definition. */
    baseImageSelect(selection: SetupBaseImageSelection): void;
    /** Retry the selected image's failed build without re-selecting it. */
    baseImageBuildRetry(): void;
    /** Create the required server default agent with an administrator-chosen name and username. */
    defaultAgentCreate(input: { name: string; username: string }): void;
    /** Commit the final registration policy and complete server setup. */
    registrationPolicyChoose(enabled: boolean): void;
    setupInput(event: SetupInput): void;
}

export type SetupStore = StoreApi<SetupState>;
