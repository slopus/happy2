import { createStore, type StoreApi } from "zustand/vanilla";
import type {
    McpResourceReadResult,
    McpToolResult,
    PluginAppSummary,
    PluginAppView,
    PluginButtonControl,
    PluginContributionActionValue,
    PluginContributionInvocationResult,
    PluginContributionSummary,
    UserError,
} from "../../types.js";
import type { Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export type PluginActionState =
    | { readonly type: "running"; readonly generation: number }
    | {
          readonly type: "succeeded";
          readonly generation: number;
          readonly result: PluginContributionInvocationResult;
      }
    | { readonly type: "error"; readonly generation: number; readonly error: UserError };

export type PluginMenuState =
    | { readonly type: "loading"; readonly generation: number }
    | {
          readonly type: "ready";
          readonly generation: number;
          readonly revision: number;
          readonly items: readonly PluginButtonControl[];
      }
    | { readonly type: "error"; readonly generation: number; readonly error: UserError };

export type PluginPresentationState =
    | { readonly type: "saving"; readonly generation: number }
    | { readonly type: "error"; readonly generation: number; readonly error: UserError };

export interface PluginContributionInvokeInput {
    readonly contributionId: string;
    readonly actionId: string;
    readonly value?: PluginContributionActionValue;
    readonly messageId?: string;
}

export type PluginNavigationOutput =
    | {
          readonly type: "appPresentationUpdateSubmitted";
          readonly instanceId: string;
          readonly hidden: boolean;
          readonly generation: number;
          readonly position?: number;
      }
    | ({
          readonly type: "pluginContributionInvokeSubmitted";
          readonly generation: number;
      } & PluginContributionInvokeInput)
    | {
          readonly type: "pluginContributionMenuResolveSubmitted";
          readonly contributionId: string;
          readonly generation: number;
          readonly messageId?: string;
      };

export type ChatContributionsOutput =
    | ({
          readonly type: "pluginContributionInvokeSubmitted";
          readonly chatId: string;
          readonly generation: number;
      } & PluginContributionInvokeInput)
    | {
          readonly type: "pluginContributionMenuResolveSubmitted";
          readonly chatId: string;
          readonly contributionId: string;
          readonly generation: number;
          readonly messageId?: string;
      };

export interface PluginNavigationSnapshot {
    readonly apps: Loadable<readonly PluginAppSummary[]>;
    readonly contributions: Loadable<readonly PluginContributionSummary[]>;
    readonly actionStates: ReadonlyMap<string, PluginActionState>;
    readonly menuStates: ReadonlyMap<string, PluginMenuState>;
    readonly presentationStates: ReadonlyMap<string, PluginPresentationState>;
}

export type PluginNavigationInput =
    | { readonly type: "pluginAppsLoading" }
    | { readonly type: "pluginAppsLoaded"; readonly apps: readonly PluginAppSummary[] }
    | { readonly type: "pluginAppsFailed"; readonly error: UserError }
    | { readonly type: "pluginContributionsLoading" }
    | {
          readonly type: "pluginContributionsLoaded";
          readonly contributions: readonly PluginContributionSummary[];
      }
    | { readonly type: "pluginContributionsFailed"; readonly error: UserError }
    | {
          readonly type: "appPresentationUpdateSucceeded";
          readonly instanceId: string;
          readonly generation: number;
          readonly app: PluginAppSummary;
      }
    | {
          readonly type: "appPresentationUpdateFailed";
          readonly instanceId: string;
          readonly generation: number;
          readonly error: UserError;
      }
    | PluginContributionResultInput;

export interface PluginNavigationState extends PluginNavigationSnapshot {
    appPresentationUpdate(instanceId: string, hidden: boolean, position?: number): void;
    pluginContributionInvoke(input: PluginContributionInvokeInput): void;
    pluginContributionMenuResolve(contributionId: string, messageId?: string): void;
    pluginNavigationInput(event: PluginNavigationInput): void;
}

export type PluginNavigationStore = StoreApi<PluginNavigationState>;

/** Creates the single global plugin navigation/profile/settings surface without starting I/O. */
export function pluginNavigationStoreCreate(
    output: (event: PluginNavigationOutput) => void = () => undefined,
): PluginNavigationStore {
    return createStore<PluginNavigationState>()((set, get) => ({
        apps: { type: "unloaded" },
        contributions: { type: "unloaded" },
        actionStates: new Map(),
        menuStates: new Map(),
        presentationStates: new Map(),
        appPresentationUpdate(instanceId, hidden, position): void {
            const generation = (get().presentationStates.get(instanceId)?.generation ?? 0) + 1;
            set((snapshot) => ({
                ...snapshot,
                presentationStates: mapSet(snapshot.presentationStates, instanceId, {
                    type: "saving",
                    generation,
                }),
            }));
            output({
                type: "appPresentationUpdateSubmitted",
                instanceId,
                hidden,
                generation,
                ...(position === undefined ? {} : { position }),
            });
        },
        pluginContributionInvoke(input): void {
            contributionInvokeStart(set, get, output, input);
        },
        pluginContributionMenuResolve(contributionId, messageId): void {
            const key = menuKey(contributionId, messageId);
            const generation = (get().menuStates.get(key)?.generation ?? 0) + 1;
            set((snapshot) => ({
                ...snapshot,
                menuStates: mapSet(snapshot.menuStates, key, { type: "loading", generation }),
            }));
            output({
                type: "pluginContributionMenuResolveSubmitted",
                contributionId,
                generation,
                ...(messageId ? { messageId } : {}),
            });
        },
        pluginNavigationInput(event): void {
            set((snapshot) => pluginNavigationReduce(snapshot, event));
        },
    }));
}

export interface ChatContributionsSnapshot {
    readonly chatId: string;
    readonly contributions: Loadable<readonly PluginContributionSummary[]>;
    readonly actionStates: ReadonlyMap<string, PluginActionState>;
    readonly menuStates: ReadonlyMap<string, PluginMenuState>;
}

export type ChatContributionsInput =
    | { readonly type: "pluginContributionsLoading" }
    | {
          readonly type: "pluginContributionsLoaded";
          readonly contributions: readonly PluginContributionSummary[];
      }
    | { readonly type: "pluginContributionsFailed"; readonly error: UserError }
    | PluginContributionResultInput;

export interface ChatContributionsState extends ChatContributionsSnapshot {
    pluginContributionInvoke(input: PluginContributionInvokeInput): void;
    pluginContributionMenuResolve(contributionId: string, messageId?: string): void;
    chatContributionsInput(event: ChatContributionsInput): void;
}

export type ChatContributionsStore = StoreApi<ChatContributionsState>;

/** Creates a contribution surface scoped to one chat without starting transport work. */
export function chatContributionsStoreCreate(
    chatId: string,
    output: (event: ChatContributionsOutput) => void = () => undefined,
): ChatContributionsStore {
    return createStore<ChatContributionsState>()((set, get) => ({
        chatId,
        contributions: { type: "unloaded" },
        actionStates: new Map(),
        menuStates: new Map(),
        pluginContributionInvoke(input): void {
            contributionInvokeStart(set, get, (event) => output({ ...event, chatId }), input);
        },
        pluginContributionMenuResolve(contributionId, messageId): void {
            const key = menuKey(contributionId, messageId);
            const generation = (get().menuStates.get(key)?.generation ?? 0) + 1;
            set((snapshot) => ({
                ...snapshot,
                menuStates: mapSet(snapshot.menuStates, key, { type: "loading", generation }),
            }));
            output({
                type: "pluginContributionMenuResolveSubmitted",
                chatId,
                contributionId,
                generation,
                ...(messageId ? { messageId } : {}),
            });
        },
        chatContributionsInput(event): void {
            set((snapshot) => contributionSurfaceReduce(snapshot, event));
        },
    }));
}

export interface PluginSurfacesActionContext {
    readonly runtime: StateRuntime;
    readonly navigation?: PluginNavigationStore;
    pluginNavigationGet(): PluginNavigationStore | undefined;
    chatContributionsGet(chatId: string): ChatContributionsStore | undefined;
}

const navigationGenerations = new WeakMap<
    PluginNavigationStore,
    { apps: number; contributions: number }
>();
const chatGenerations = new WeakMap<ChatContributionsStore, number>();

/** Reconciles both global plugin lists from their authoritative GET APIs. */
export async function pluginNavigationLoad(context: PluginSurfacesActionContext): Promise<void> {
    const store = context.pluginNavigationGet();
    if (!store) return;
    const current = navigationGenerations.get(store) ?? { apps: 0, contributions: 0 };
    const generations = { apps: current.apps + 1, contributions: current.contributions + 1 };
    navigationGenerations.set(store, generations);
    if (store.getState().apps.type !== "ready")
        store.getState().pluginNavigationInput({ type: "pluginAppsLoading" });
    if (store.getState().contributions.type !== "ready")
        store.getState().pluginNavigationInput({ type: "pluginContributionsLoading" });
    await Promise.all([
        context.runtime.operation("getPluginApps").then(
            ({ apps }) => {
                if (context.pluginNavigationGet() !== store) return;
                if (navigationGenerations.get(store)?.apps !== generations.apps) return;
                store.getState().pluginNavigationInput({ type: "pluginAppsLoaded", apps });
            },
            (error: unknown) => {
                if (context.pluginNavigationGet() !== store) return;
                if (navigationGenerations.get(store)?.apps !== generations.apps) return;
                store.getState().pluginNavigationInput({
                    type: "pluginAppsFailed",
                    error: userError(error),
                });
            },
        ),
        context.runtime.operation("getPluginContributions", {}).then(
            ({ contributions }) => {
                if (context.pluginNavigationGet() !== store) return;
                if (navigationGenerations.get(store)?.contributions !== generations.contributions)
                    return;
                store.getState().pluginNavigationInput({
                    type: "pluginContributionsLoaded",
                    contributions,
                });
            },
            (error: unknown) => {
                if (context.pluginNavigationGet() !== store) return;
                if (navigationGenerations.get(store)?.contributions !== generations.contributions)
                    return;
                store.getState().pluginNavigationInput({
                    type: "pluginContributionsFailed",
                    error: userError(error),
                });
            },
        ),
    ]);
}

/** Reconciles one retained chat's global-plus-chat contributions through its scoped GET. */
export async function chatContributionsLoad(
    context: PluginSurfacesActionContext,
    chatId: string,
): Promise<void> {
    const store = context.chatContributionsGet(chatId);
    if (!store) return;
    const generation = (chatGenerations.get(store) ?? 0) + 1;
    chatGenerations.set(store, generation);
    if (store.getState().contributions.type !== "ready")
        store.getState().chatContributionsInput({ type: "pluginContributionsLoading" });
    try {
        const { contributions } = await context.runtime.operation("getPluginContributions", {
            chatId,
        });
        if (context.chatContributionsGet(chatId) !== store) return;
        if (chatGenerations.get(store) !== generation) return;
        store.getState().chatContributionsInput({
            type: "pluginContributionsLoaded",
            contributions,
        });
    } catch (error) {
        if (context.chatContributionsGet(chatId) !== store) return;
        if (chatGenerations.get(store) !== generation) return;
        store.getState().chatContributionsInput({
            type: "pluginContributionsFailed",
            error: userError(error),
        });
    }
}

/** Routes a native contribution intent and writes only its transient completion state. */
export async function pluginContributionOutputRoute(
    context: PluginSurfacesActionContext,
    event: PluginNavigationOutput | ChatContributionsOutput,
): Promise<void> {
    if (event.type === "appPresentationUpdateSubmitted") {
        const store = context.pluginNavigationGet();
        if (!store) return;
        try {
            const { app } = await context.runtime.operation("updateAppPresentation", {
                instanceId: event.instanceId,
                hidden: event.hidden,
                ...(event.position === undefined ? {} : { position: event.position }),
            });
            if (context.pluginNavigationGet() !== store) return;
            store.getState().pluginNavigationInput({
                type: "appPresentationUpdateSucceeded",
                instanceId: event.instanceId,
                generation: event.generation,
                app,
            });
        } catch (error) {
            if (context.pluginNavigationGet() !== store) return;
            store.getState().pluginNavigationInput({
                type: "appPresentationUpdateFailed",
                instanceId: event.instanceId,
                generation: event.generation,
                error: userError(error),
            });
        }
        return;
    }
    const store =
        "chatId" in event
            ? context.chatContributionsGet(event.chatId)
            : context.pluginNavigationGet();
    if (!store) return;
    const input = {
        contributionId: event.contributionId,
        ...("chatId" in event ? { chatId: event.chatId } : {}),
        ...(event.messageId ? { messageId: event.messageId } : {}),
    };
    if (event.type === "pluginContributionInvokeSubmitted") {
        try {
            const result = await context.runtime.operation("invokePluginContribution", {
                ...input,
                actionId: event.actionId,
                ...(event.value === undefined ? {} : { value: event.value }),
            });
            if (!contributionStoreCurrent(context, event, store)) return;
            contributionInput(store, {
                type: "pluginContributionInvokeSucceeded",
                contributionId: event.contributionId,
                actionId: event.actionId,
                generation: event.generation,
                ...(event.messageId ? { messageId: event.messageId } : {}),
                result,
            });
        } catch (error) {
            if (!contributionStoreCurrent(context, event, store)) return;
            contributionInput(store, {
                type: "pluginContributionInvokeFailed",
                contributionId: event.contributionId,
                actionId: event.actionId,
                generation: event.generation,
                ...(event.messageId ? { messageId: event.messageId } : {}),
                error: userError(error),
            });
        }
        return;
    }
    try {
        const result = await context.runtime.operation("resolvePluginContributionMenu", input);
        if (!contributionStoreCurrent(context, event, store)) return;
        contributionInput(store, {
            type: "pluginContributionMenuResolved",
            contributionId: event.contributionId,
            generation: event.generation,
            ...(event.messageId ? { messageId: event.messageId } : {}),
            ...result,
        });
    } catch (error) {
        if (!contributionStoreCurrent(context, event, store)) return;
        contributionInput(store, {
            type: "pluginContributionMenuFailed",
            contributionId: event.contributionId,
            generation: event.generation,
            ...(event.messageId ? { messageId: event.messageId } : {}),
            error: userError(error),
        });
    }
}

export interface ChatContributionsOpenContext extends PluginSurfacesActionContext {
    chatContributionsAcquire(chatId: string): ChatContributionsStore;
    chatContributionsRelease(chatId: string): void;
    chatContributionsLoad(chatId: string): void;
}

export interface ChatContributionsHandle extends ChatContributionsStore, Disposable {}

/** Acquires one deduplicated chat contribution surface and releases its final lease exactly once. */
export function chatContributionsOpen(
    context: ChatContributionsOpenContext,
    chatId: string,
): ChatContributionsHandle {
    const store = context.chatContributionsAcquire(chatId);
    if (store.getState().contributions.type === "unloaded") context.chatContributionsLoad(chatId);
    let disposed = false;
    return {
        ...store,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.chatContributionsRelease(chatId);
        },
    };
}

export interface PluginAppInstanceSnapshot {
    readonly instanceId: string;
    readonly view: Loadable<PluginAppView>;
}

export type PluginAppInstanceInput =
    | { readonly type: "pluginAppLoading" }
    | { readonly type: "pluginAppLoaded"; readonly view: PluginAppView }
    | { readonly type: "pluginAppFailed"; readonly error: UserError };

export interface PluginAppInstanceState extends PluginAppInstanceSnapshot {
    pluginAppInput(event: PluginAppInstanceInput): void;
}

export type PluginAppInstanceStore = StoreApi<PluginAppInstanceState>;

/** Creates a durable app-instance store whose HTML/resource identity survives context revisions. */
export function pluginAppInstanceStoreCreate(instanceId: string): PluginAppInstanceStore {
    return createStore<PluginAppInstanceState>()((set) => ({
        instanceId,
        view: { type: "unloaded" },
        pluginAppInput(event): void {
            set((snapshot) => {
                if (event.type === "pluginAppLoading")
                    return snapshot.view.type === "ready"
                        ? snapshot
                        : { ...snapshot, view: { type: "loading" } };
                if (event.type === "pluginAppFailed")
                    return { ...snapshot, view: { type: "error", error: event.error } };
                const previous = snapshot.view.type === "ready" ? snapshot.view.value : undefined;
                const view = stableAppView(previous, event.view);
                return previous === view
                    ? snapshot
                    : { ...snapshot, view: { type: "ready", value: view } };
            });
        },
    }));
}

export interface PluginAppActionContext {
    readonly runtime: StateRuntime;
    pluginAppGet(instanceId: string): PluginAppInstanceStore | undefined;
}

interface PluginAppLoadState {
    running: boolean;
    queued: boolean;
}
const appLoadStates = new WeakMap<PluginAppInstanceStore, PluginAppLoadState>();

/** Coalesces durable app refreshes and drops completions after the last instance lease closes. */
export async function pluginAppLoad(
    context: PluginAppActionContext,
    instanceId: string,
): Promise<void> {
    const store = context.pluginAppGet(instanceId);
    if (!store) return;
    const state = appLoadStates.get(store) ?? { running: false, queued: false };
    appLoadStates.set(store, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        if (store.getState().view.type !== "ready")
            store.getState().pluginAppInput({ type: "pluginAppLoading" });
        do {
            state.queued = false;
            try {
                const view = await context.runtime.operation("getPluginApp", { instanceId });
                if (context.pluginAppGet(instanceId) !== store) return;
                store.getState().pluginAppInput({ type: "pluginAppLoaded", view });
            } catch (error) {
                if (context.pluginAppGet(instanceId) !== store) return;
                if (!state.queued)
                    store.getState().pluginAppInput({
                        type: "pluginAppFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

/** Executes one non-retryable app-initiated tool call through the durable instance authority. */
export async function pluginAppToolCall(
    runtime: StateRuntime,
    instanceId: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
): Promise<McpToolResult> {
    return (
        await runtime.operation("callPluginAppTool", {
            instanceId,
            name,
            arguments: args,
        })
    ).result;
}

/** Executes one non-retryable resource read through the durable instance authority. */
export async function pluginAppResourceRead(
    runtime: StateRuntime,
    instanceId: string,
    uri: string,
): Promise<McpResourceReadResult> {
    return (await runtime.operation("readPluginAppResource", { instanceId, uri })).result;
}

/** Reads one authorized monochrome PNG as bytes; the UI owns its blob URL lifetime. */
export async function pluginUiAssetRead(
    runtime: StateRuntime,
    installationId: string,
    assetId: string,
): Promise<ArrayBuffer> {
    return runtime.operation("getPluginUiAsset", { installationId, assetId });
}

export interface PluginAppOpenContext extends PluginAppActionContext {
    pluginAppAcquire(instanceId: string): PluginAppInstanceStore;
    pluginAppRelease(instanceId: string): void;
    pluginAppLoad(instanceId: string): void;
    pluginAppToolCall(
        instanceId: string,
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<McpToolResult>;
    pluginAppResourceRead(instanceId: string, uri: string): Promise<McpResourceReadResult>;
}

export interface PluginAppHandle extends PluginAppInstanceStore, Disposable {
    pluginAppReload(): void;
    pluginAppToolCall(
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<McpToolResult>;
    pluginAppResourceRead(uri: string): Promise<McpResourceReadResult>;
}

/** Opens one stable handle for a durable app instance, independent of its data revision. */
export function pluginAppOpen(context: PluginAppOpenContext, instanceId: string): PluginAppHandle {
    const store = context.pluginAppAcquire(instanceId);
    if (store.getState().view.type === "unloaded") context.pluginAppLoad(instanceId);
    let disposed = false;
    return {
        ...store,
        pluginAppReload: () => context.pluginAppLoad(instanceId),
        pluginAppToolCall: (name, args) => context.pluginAppToolCall(instanceId, name, args),
        pluginAppResourceRead: (uri) => context.pluginAppResourceRead(instanceId, uri),
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.pluginAppRelease(instanceId);
        },
    };
}

type PluginContributionResultInput =
    | {
          readonly type: "pluginContributionInvokeSucceeded";
          readonly contributionId: string;
          readonly actionId: string;
          readonly generation: number;
          readonly messageId?: string;
          readonly result: PluginContributionInvocationResult;
      }
    | {
          readonly type: "pluginContributionInvokeFailed";
          readonly contributionId: string;
          readonly actionId: string;
          readonly generation: number;
          readonly messageId?: string;
          readonly error: UserError;
      }
    | {
          readonly type: "pluginContributionMenuResolved";
          readonly contributionId: string;
          readonly messageId?: string;
          readonly generation: number;
          readonly revision: number;
          readonly items: readonly PluginButtonControl[];
      }
    | {
          readonly type: "pluginContributionMenuFailed";
          readonly contributionId: string;
          readonly messageId?: string;
          readonly generation: number;
          readonly error: UserError;
      };

function pluginNavigationReduce(
    snapshot: PluginNavigationState,
    event: PluginNavigationInput,
): PluginNavigationState {
    if (event.type === "pluginAppsLoading")
        return snapshot.apps.type === "ready"
            ? snapshot
            : { ...snapshot, apps: { type: "loading" } };
    if (event.type === "pluginAppsFailed")
        return { ...snapshot, apps: { type: "error", error: event.error } };
    if (event.type === "pluginAppsLoaded") {
        const previous = snapshot.apps.type === "ready" ? snapshot.apps.value : [];
        const apps = stableEntities(previous, event.apps);
        return previous === apps ? snapshot : { ...snapshot, apps: { type: "ready", value: apps } };
    }
    if (event.type === "appPresentationUpdateSucceeded") {
        if (snapshot.presentationStates.get(event.instanceId)?.generation !== event.generation)
            return snapshot;
        const previous = snapshot.apps.type === "ready" ? snapshot.apps.value : [];
        const apps = stableEntities(
            previous,
            previous.map((item) => (item.id === event.instanceId ? event.app : item)),
        );
        return {
            ...snapshot,
            apps: snapshot.apps.type === "ready" ? { type: "ready", value: apps } : snapshot.apps,
            presentationStates: mapDelete(snapshot.presentationStates, event.instanceId),
        };
    }
    if (event.type === "appPresentationUpdateFailed")
        return snapshot.presentationStates.get(event.instanceId)?.generation !== event.generation
            ? snapshot
            : {
                  ...snapshot,
                  presentationStates: mapSet(snapshot.presentationStates, event.instanceId, {
                      type: "error",
                      generation: event.generation,
                      error: event.error,
                  }),
              };
    return contributionSurfaceReduce(snapshot, event);
}

function contributionSurfaceReduce<
    T extends {
        readonly contributions: Loadable<readonly PluginContributionSummary[]>;
        readonly actionStates: ReadonlyMap<string, PluginActionState>;
        readonly menuStates: ReadonlyMap<string, PluginMenuState>;
    },
>(snapshot: T, event: ChatContributionsInput | PluginNavigationInput): T {
    if (event.type === "pluginContributionsLoading")
        return (
            snapshot.contributions.type === "ready"
                ? snapshot
                : { ...snapshot, contributions: { type: "loading" } }
        ) as T;
    if (event.type === "pluginContributionsFailed")
        return { ...snapshot, contributions: { type: "error", error: event.error } } as T;
    if (event.type === "pluginContributionsLoaded") {
        const previous =
            snapshot.contributions.type === "ready" ? snapshot.contributions.value : [];
        const contributions = stableEntities(previous, event.contributions);
        return (
            previous === contributions
                ? snapshot
                : { ...snapshot, contributions: { type: "ready", value: contributions } }
        ) as T;
    }
    if (
        event.type === "pluginContributionInvokeSucceeded" ||
        event.type === "pluginContributionInvokeFailed"
    ) {
        const key = actionKey(event.contributionId, event.actionId, event.messageId);
        if (snapshot.actionStates.get(key)?.generation !== event.generation) return snapshot;
        const value: PluginActionState =
            event.type === "pluginContributionInvokeSucceeded"
                ? { type: "succeeded", generation: event.generation, result: event.result }
                : { type: "error", generation: event.generation, error: event.error };
        return { ...snapshot, actionStates: mapSet(snapshot.actionStates, key, value) } as T;
    }
    if (
        event.type === "pluginContributionMenuResolved" ||
        event.type === "pluginContributionMenuFailed"
    ) {
        const key = menuKey(event.contributionId, event.messageId);
        if (snapshot.menuStates.get(key)?.generation !== event.generation) return snapshot;
        const value: PluginMenuState =
            event.type === "pluginContributionMenuResolved"
                ? {
                      type: "ready",
                      generation: event.generation,
                      revision: event.revision,
                      items: event.items,
                  }
                : { type: "error", generation: event.generation, error: event.error };
        return { ...snapshot, menuStates: mapSet(snapshot.menuStates, key, value) } as T;
    }
    return snapshot;
}

function contributionInvokeStart<
    T extends { readonly actionStates: ReadonlyMap<string, PluginActionState> },
>(
    set: (updater: (snapshot: T) => T) => void,
    get: () => T,
    output: (
        event: {
            readonly type: "pluginContributionInvokeSubmitted";
            readonly generation: number;
        } & PluginContributionInvokeInput,
    ) => void,
    input: PluginContributionInvokeInput,
): void {
    const key = actionKey(input.contributionId, input.actionId, input.messageId);
    const generation = (get().actionStates.get(key)?.generation ?? 0) + 1;
    set((snapshot) => ({
        ...snapshot,
        actionStates: mapSet(snapshot.actionStates, key, { type: "running", generation }),
    }));
    output({ type: "pluginContributionInvokeSubmitted", generation, ...input });
}

function contributionInput(
    store: PluginNavigationStore | ChatContributionsStore,
    event: PluginContributionResultInput,
): void {
    const state = store.getState();
    if ("pluginNavigationInput" in state) state.pluginNavigationInput(event);
    else state.chatContributionsInput(event);
}

function contributionStoreCurrent(
    context: PluginSurfacesActionContext,
    event: PluginNavigationOutput | ChatContributionsOutput,
    store: PluginNavigationStore | ChatContributionsStore,
): boolean {
    return "chatId" in event
        ? context.chatContributionsGet(event.chatId) === store
        : context.pluginNavigationGet() === store;
}

function stableAppView(previous: PluginAppView | undefined, next: PluginAppView): PluginAppView {
    if (!previous) return next;
    const app = jsonEqual(previous.app, next.app) ? previous.app : next.app;
    const resource = jsonEqual(previous.resource, next.resource)
        ? previous.resource
        : next.resource;
    const hostContext = jsonEqual(previous.hostContext, next.hostContext)
        ? previous.hostContext
        : next.hostContext;
    return app === previous.app &&
        resource === previous.resource &&
        hostContext === previous.hostContext
        ? previous
        : { app, resource, hostContext };
}

function stableEntities<T extends { readonly id: string }>(
    previous: readonly T[],
    next: readonly T[],
): readonly T[] {
    const byId = new Map(previous.map((item) => [item.id, item]));
    let changed = previous.length !== next.length;
    const result = next.map((item, index) => {
        const old = byId.get(item.id);
        const stable = old && jsonEqual(old, item) ? old : item;
        if (stable !== previous[index]) changed = true;
        return stable;
    });
    return changed ? result : previous;
}

function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function mapSet<K, V>(source: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
    const next = new Map(source);
    next.set(key, value);
    return next;
}

function mapDelete<K, V>(source: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
    if (!source.has(key)) return source;
    const next = new Map(source);
    next.delete(key);
    return next;
}

function actionKey(contributionId: string, actionId: string, messageId?: string): string {
    return `${contributionId}\u0000${actionId}\u0000${messageId ?? ""}`;
}

function menuKey(contributionId: string, messageId?: string): string {
    return `${contributionId}\u0000${messageId ?? ""}`;
}
