import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type PluginCatalogItem,
    type PluginHostPermission,
    type PluginInstallationSummary,
    type PluginPrepareProgress,
    type PluginUpdateCheck,
    type SystemPluginSummary,
} from "../../resources.js";
import { UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface PluginsActionContext {
    readonly runtime: StateRuntime;
    readonly plugins: PluginsStore;
}

const generations = new WeakMap<PluginsStore, number>();

/** One cancel function per system plugin whose update-check stream is currently open. */
const updateCheckStreams = new WeakMap<PluginsStore, Map<string, () => void>>();

/**
 * Loads the administrator plugin surface: the built-in catalog with per-package
 * installations and the persisted system plugins, which include externally
 * sourced packages absent from the catalog. Reads never contain configured
 * variable values. Reconciling an already-ready surface keeps the current lists
 * on screen until each fresh read lands, so realtime install-lifecycle hints
 * never blank the surface. A fresh system-plugin read also re-ensures automatic
 * update checks while the surface is being watched.
 */
export async function pluginsLoad(context: PluginsActionContext): Promise<void> {
    const generation = (generations.get(context.plugins) ?? 0) + 1;
    generations.set(context.plugins, generation);
    context.plugins.getState().pluginsInput({ type: "pluginsLoading" });
    context.plugins.getState().pluginsInput({ type: "systemPluginsLoading" });
    const current = () => generations.get(context.plugins) === generation;
    await Promise.all([
        (async () => {
            try {
                const result = await context.runtime.operation("getPluginCatalog");
                if (!current()) return;
                context.plugins
                    .getState()
                    .pluginsInput({ type: "pluginsLoaded", plugins: result.plugins });
            } catch (error) {
                if (current())
                    context.plugins
                        .getState()
                        .pluginsInput({ type: "pluginsFailed", error: userError(error) });
            }
        })(),
        (async () => {
            try {
                const result = await context.runtime.operation("getSystemPlugins");
                if (!current()) return;
                context.plugins
                    .getState()
                    .pluginsInput({ type: "systemPluginsLoaded", plugins: result.plugins });
                if (context.plugins.getState().updateChecksActive)
                    context.runtime.background(pluginsUpdateChecksEnsure(context));
            } catch (error) {
                if (current())
                    context.plugins
                        .getState()
                        .pluginsInput({ type: "systemPluginsFailed", error: userError(error) });
            }
        })(),
    ]);
}

/**
 * Routes one typed plugins-surface intent to its durable server action: catalog
 * installs, permission replacements, system-plugin uninstalls, and the automatic
 * update-check watch that runs only while the plugin-management surface is visible.
 * Every durable mutation reconciles the whole surface afterwards so installations,
 * grants, and health stay authoritative.
 */
export async function pluginsOutputRoute(
    context: PluginsActionContext,
    event: PluginsOutput,
): Promise<void> {
    switch (event.type) {
        case "pluginInstallSubmitted": {
            try {
                const result = await context.runtime.operation("installPlugin", {
                    shortName: event.shortName,
                    ...(Object.keys(event.variables).length ? { variables: event.variables } : {}),
                    ...(event.permissions.length ? { permissions: event.permissions } : {}),
                    ...(event.containerImageId ? { containerImageId: event.containerImageId } : {}),
                });
                context.plugins.getState().pluginsInput({
                    type: "pluginInstalled",
                    shortName: event.shortName,
                    installation: result.installation,
                });
                await pluginsLoad(context);
            } catch (error) {
                context.plugins.getState().pluginsInput({
                    type: "pluginInstallFailed",
                    shortName: event.shortName,
                    error: userError(error),
                });
            }
            return;
        }
        case "pluginPermissionsUpdateSubmitted": {
            try {
                const result = await context.runtime.operation("updatePluginPermissions", {
                    installationId: event.installationId,
                    permissions: event.permissions,
                });
                context.plugins.getState().pluginsInput({
                    type: "pluginPermissionsUpdated",
                    installation: result.installation,
                });
                await pluginsLoad(context);
            } catch (error) {
                context.plugins.getState().pluginsInput({
                    type: "pluginPermissionsUpdateFailed",
                    installationId: event.installationId,
                    error: userError(error),
                });
            }
            return;
        }
        case "pluginUninstallSubmitted": {
            try {
                await context.runtime.operation("uninstallPlugin", { pluginId: event.pluginId });
                updateCheckStreamCancel(context.plugins, event.pluginId);
                context.plugins
                    .getState()
                    .pluginsInput({ type: "pluginUninstalled", pluginId: event.pluginId });
                await pluginsLoad(context);
            } catch (error) {
                context.plugins.getState().pluginsInput({
                    type: "pluginUninstallFailed",
                    pluginId: event.pluginId,
                    error: userError(error),
                });
            }
            return;
        }
        case "pluginUpdateChecksStarted": {
            await pluginsUpdateChecksEnsure(context);
            return;
        }
        case "pluginUpdateChecksStopped": {
            pluginsUpdateChecksStop(context.plugins);
            return;
        }
    }
}

/**
 * Opens one read-only update-check stream for every installed system plugin
 * that can be compared against its source and has no current result for its
 * installed package digest. Progress and terminal results land through the
 * private writer; streams stay registered so stopping the watch or
 * uninstalling the plugin cancels them. Resolves once every stream it opened
 * has terminated or been cancelled.
 */
export async function pluginsUpdateChecksEnsure(context: PluginsActionContext): Promise<void> {
    const snapshot = context.plugins.getState();
    if (!snapshot.updateChecksActive || snapshot.systemPlugins.type !== "ready") return;
    if (!context.runtime.active) return;
    const streams = updateCheckStreamsFor(context.plugins);
    const pending: Promise<void>[] = [];
    for (const plugin of snapshot.systemPlugins.value) {
        if (plugin.sourceKind === "upload") continue;
        if (streams.has(plugin.id)) continue;
        const existing = snapshot.updateChecks.get(plugin.id);
        if (
            existing &&
            !(
                existing.status === "checked" &&
                existing.update.installed.packageDigest !== plugin.packageDigest
            )
        )
            continue;
        pending.push(updateCheckStreamOpen(context, streams, plugin.id));
    }
    await Promise.all(pending);
}

/** Cancels every open update-check stream; the surface stopped watching or is being disposed. */
export function pluginsUpdateChecksStop(plugins: PluginsStore): void {
    const streams = updateCheckStreams.get(plugins);
    if (!streams) return;
    for (const cancel of streams.values()) cancel();
    streams.clear();
}

function updateCheckStreamOpen(
    context: PluginsActionContext,
    streams: Map<string, () => void>,
    pluginId: string,
): Promise<void> {
    let terminalResolve!: () => void;
    const terminal = new Promise<void>((resolve) => {
        terminalResolve = resolve;
    });
    let settled = false;
    const settle = () => {
        if (settled) return;
        settled = true;
        streams.delete(pluginId);
        terminalResolve();
    };
    context.plugins.getState().pluginsInput({ type: "pluginUpdateCheckStarted", pluginId });
    const cancel = context.runtime.operationStream(
        "checkPluginUpdate",
        { pluginId },
        {
            onEvent: (event) => {
                if (settled) return;
                if (event.event === "progress") {
                    context.plugins.getState().pluginsInput({
                        type: "pluginUpdateCheckProgressed",
                        pluginId,
                        progress: event.data as PluginPrepareProgress,
                    });
                    return;
                }
                if (event.event === "checked") {
                    const data = event.data as { readonly update: PluginUpdateCheck };
                    context.plugins.getState().pluginsInput({
                        type: "pluginUpdateChecked",
                        pluginId,
                        update: data.update,
                    });
                    settle();
                    return;
                }
                if (event.event === "failed") {
                    const data = event.data as {
                        readonly error?: string;
                        readonly message?: string;
                    };
                    context.plugins.getState().pluginsInput({
                        type: "pluginUpdateCheckFailed",
                        pluginId,
                        error: new UserError(
                            data.message ?? "The update check failed.",
                            data.error,
                        ),
                    });
                    settle();
                }
            },
            onEnd: () => {
                if (settled) return;
                context.plugins.getState().pluginsInput({
                    type: "pluginUpdateCheckFailed",
                    pluginId,
                    error: new UserError("The update check ended before a result arrived."),
                });
                settle();
            },
            onError: (error) => {
                if (settled) return;
                context.plugins
                    .getState()
                    .pluginsInput({ type: "pluginUpdateCheckFailed", pluginId, error });
                settle();
            },
        },
    );
    streams.set(pluginId, () => {
        settled = true;
        streams.delete(pluginId);
        cancel();
        terminalResolve();
    });
    if (settled) streams.delete(pluginId);
    return terminal;
}

function updateCheckStreamsFor(plugins: PluginsStore): Map<string, () => void> {
    let streams = updateCheckStreams.get(plugins);
    if (!streams) {
        streams = new Map();
        updateCheckStreams.set(plugins, streams);
    }
    return streams;
}

function updateCheckStreamCancel(plugins: PluginsStore, pluginId: string): void {
    const cancel = updateCheckStreams.get(plugins)?.get(pluginId);
    if (cancel) cancel();
}

/** Creates the plugin catalog surface; secret variable values exist only transiently inside the typed install output event. */
export function pluginsStoreCreate(
    output: (event: PluginsOutput) => void = () => undefined,
): PluginsStore {
    return createStore<PluginsState>()((set, get) => ({
        catalog: { type: "unloaded" },
        systemPlugins: { type: "unloaded" },
        installing: [],
        uninstalling: [],
        updatingPermissions: [],
        updateChecksActive: false,
        updateChecks: new Map(),
        pluginInstall(shortName, variables, permissions, containerImageId): void {
            set((snapshot) => ({
                ...snapshot,
                installing: snapshot.installing.includes(shortName)
                    ? snapshot.installing
                    : [...snapshot.installing, shortName],
                actionError: undefined,
            }));
            output({
                type: "pluginInstallSubmitted",
                shortName,
                variables,
                permissions: [...permissions],
                ...(containerImageId ? { containerImageId } : {}),
            });
        },
        pluginPermissionsUpdate(installationId, permissions): void {
            if (get().updatingPermissions.includes(installationId)) return;
            set((snapshot) => ({
                ...snapshot,
                updatingPermissions: [...snapshot.updatingPermissions, installationId],
                actionError: undefined,
            }));
            output({
                type: "pluginPermissionsUpdateSubmitted",
                installationId,
                permissions: [...permissions],
            });
        },
        pluginUninstall(pluginId): void {
            if (get().uninstalling.includes(pluginId)) return;
            set((snapshot) => ({
                ...snapshot,
                uninstalling: [...snapshot.uninstalling, pluginId],
                actionError: undefined,
            }));
            output({ type: "pluginUninstallSubmitted", pluginId });
        },
        updateChecksStart(): void {
            if (get().updateChecksActive) return;
            set((snapshot) => ({
                ...snapshot,
                updateChecksActive: true,
                // Failed checks retry on the next watch; completed results stay valid per digest.
                updateChecks: mapWithout(
                    snapshot.updateChecks,
                    (state) => state.status === "failed",
                ),
            }));
            output({ type: "pluginUpdateChecksStarted" });
        },
        updateChecksStop(): void {
            if (!get().updateChecksActive) return;
            set((snapshot) => ({
                ...snapshot,
                updateChecksActive: false,
                // A checking state without its cancelled stream is not a result.
                // Removing it lets the next visible lifetime restart the check.
                updateChecks: mapWithout(
                    snapshot.updateChecks,
                    (state) => state.status === "checking",
                ),
            }));
            output({ type: "pluginUpdateChecksStopped" });
        },
        pluginsInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "pluginsLoading":
                        return snapshot.catalog.type === "ready"
                            ? snapshot
                            : { ...snapshot, catalog: { type: "loading" } };
                    case "pluginsFailed":
                        return { ...snapshot, catalog: { type: "error", error: event.error } };
                    case "pluginsLoaded":
                        return { ...snapshot, catalog: { type: "ready", value: event.plugins } };
                    case "systemPluginsLoading":
                        return snapshot.systemPlugins.type === "ready"
                            ? snapshot
                            : { ...snapshot, systemPlugins: { type: "loading" } };
                    case "systemPluginsFailed":
                        return {
                            ...snapshot,
                            systemPlugins: { type: "error", error: event.error },
                        };
                    case "systemPluginsLoaded":
                        return {
                            ...snapshot,
                            systemPlugins: { type: "ready", value: event.plugins },
                        };
                    case "pluginInstallFailed":
                        return {
                            ...snapshot,
                            installing: snapshot.installing.filter(
                                (shortName) => shortName !== event.shortName,
                            ),
                            actionError: event.error,
                        };
                    case "pluginInstalled":
                        return {
                            ...snapshot,
                            installing: snapshot.installing.filter(
                                (shortName) => shortName !== event.shortName,
                            ),
                            catalog: installationUpsert(snapshot.catalog, event.installation),
                            actionError: undefined,
                        };
                    case "pluginPermissionsUpdated":
                        return {
                            ...snapshot,
                            updatingPermissions: snapshot.updatingPermissions.filter(
                                (installationId) => installationId !== event.installation.id,
                            ),
                            catalog: installationUpsert(snapshot.catalog, event.installation),
                            systemPlugins: systemInstallationUpsert(
                                snapshot.systemPlugins,
                                event.installation,
                            ),
                            actionError: undefined,
                        };
                    case "pluginPermissionsUpdateFailed":
                        return {
                            ...snapshot,
                            updatingPermissions: snapshot.updatingPermissions.filter(
                                (installationId) => installationId !== event.installationId,
                            ),
                            actionError: event.error,
                        };
                    case "pluginUninstalled":
                        return {
                            ...snapshot,
                            uninstalling: snapshot.uninstalling.filter(
                                (pluginId) => pluginId !== event.pluginId,
                            ),
                            systemPlugins:
                                snapshot.systemPlugins.type === "ready"
                                    ? {
                                          type: "ready",
                                          value: snapshot.systemPlugins.value.filter(
                                              (plugin) => plugin.id !== event.pluginId,
                                          ),
                                      }
                                    : snapshot.systemPlugins,
                            catalog: systemPluginRemove(snapshot.catalog, event.pluginId),
                            updateChecks: mapDelete(snapshot.updateChecks, event.pluginId),
                            actionError: undefined,
                        };
                    case "pluginUninstallFailed":
                        return {
                            ...snapshot,
                            uninstalling: snapshot.uninstalling.filter(
                                (pluginId) => pluginId !== event.pluginId,
                            ),
                            actionError: event.error,
                        };
                    case "pluginUpdateCheckStarted":
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.pluginId, {
                                status: "checking",
                            }),
                        };
                    case "pluginUpdateCheckProgressed": {
                        const current = snapshot.updateChecks.get(event.pluginId);
                        if (current?.status !== "checking") return snapshot;
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.pluginId, {
                                status: "checking",
                                progress: event.progress,
                            }),
                        };
                    }
                    case "pluginUpdateChecked":
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.pluginId, {
                                status: "checked",
                                update: event.update,
                            }),
                        };
                    case "pluginUpdateCheckFailed":
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.pluginId, {
                                status: "failed",
                                error: event.error,
                            }),
                        };
                }
            });
        },
    }));
}

function installationUpsert(
    catalog: Loadable<readonly PluginCatalogItem[]>,
    installation: PluginInstallationSummary,
): Loadable<readonly PluginCatalogItem[]> {
    if (catalog.type !== "ready") return catalog;
    return {
        type: "ready",
        value: catalog.value.map((item) => {
            if (item.shortName !== installation.shortName || !item.systemPlugin) return item;
            const existing = item.systemPlugin.installations.findIndex(
                (candidate) => candidate.id === installation.id,
            );
            const installations =
                existing < 0
                    ? [...item.systemPlugin.installations, installation]
                    : item.systemPlugin.installations.map((candidate, index) =>
                          index === existing ? installation : candidate,
                      );
            return { ...item, systemPlugin: { ...item.systemPlugin, installations } };
        }),
    };
}

function systemPluginRemove(
    catalog: Loadable<readonly PluginCatalogItem[]>,
    pluginId: string,
): Loadable<readonly PluginCatalogItem[]> {
    if (catalog.type !== "ready") return catalog;
    if (!catalog.value.some((item) => item.systemPlugin?.id === pluginId)) return catalog;
    return {
        type: "ready",
        value: catalog.value.map((item) =>
            item.systemPlugin?.id === pluginId ? { ...item, systemPlugin: undefined } : item,
        ),
    };
}

function systemInstallationUpsert(
    plugins: Loadable<readonly SystemPluginSummary[]>,
    installation: PluginInstallationSummary,
): Loadable<readonly SystemPluginSummary[]> {
    if (plugins.type !== "ready") return plugins;
    return {
        type: "ready",
        value: plugins.value.map((plugin) =>
            plugin.id !== installation.pluginId
                ? plugin
                : {
                      ...plugin,
                      installations: plugin.installations.map((candidate) =>
                          candidate.id === installation.id ? installation : candidate,
                      ),
                  },
        ),
    };
}

function mapSet(
    map: ReadonlyMap<string, PluginUpdateCheckState>,
    key: string,
    value: PluginUpdateCheckState,
): ReadonlyMap<string, PluginUpdateCheckState> {
    const next = new Map(map);
    next.set(key, value);
    return next;
}

function mapDelete(
    map: ReadonlyMap<string, PluginUpdateCheckState>,
    key: string,
): ReadonlyMap<string, PluginUpdateCheckState> {
    if (!map.has(key)) return map;
    const next = new Map(map);
    next.delete(key);
    return next;
}

function mapWithout(
    map: ReadonlyMap<string, PluginUpdateCheckState>,
    remove: (state: PluginUpdateCheckState) => boolean,
): ReadonlyMap<string, PluginUpdateCheckState> {
    if (![...map.values()].some(remove)) return map;
    const next = new Map<string, PluginUpdateCheckState>();
    for (const [key, state] of map) if (!remove(state)) next.set(key, state);
    return next;
}

export type PluginUpdateCheckState =
    | { readonly status: "checking"; readonly progress?: PluginPrepareProgress }
    | { readonly status: "checked"; readonly update: PluginUpdateCheck }
    | { readonly status: "failed"; readonly error: UserError };

export interface PluginsSnapshot {
    readonly catalog: Loadable<readonly PluginCatalogItem[]>;
    /** Persisted system plugins, including externally sourced packages absent from the catalog. */
    readonly systemPlugins: Loadable<readonly SystemPluginSummary[]>;
    /** Catalog short names whose install request is still in flight. */
    readonly installing: readonly string[];
    /** System plugin IDs whose uninstall request is still in flight. */
    readonly uninstalling: readonly string[];
    /** Installation IDs whose permission replacement is still in flight. */
    readonly updatingPermissions: readonly string[];
    /** True while the plugin-management surface is visible and automatic update checks run. */
    readonly updateChecksActive: boolean;
    /** The latest automatic remote update check per system plugin ID. */
    readonly updateChecks: ReadonlyMap<string, PluginUpdateCheckState>;
    readonly actionError?: UserError;
}

export type PluginsOutput =
    | {
          readonly type: "pluginInstallSubmitted";
          readonly shortName: string;
          readonly variables: Readonly<Record<string, string>>;
          readonly permissions: readonly PluginHostPermission[];
          readonly containerImageId?: string;
      }
    | {
          readonly type: "pluginPermissionsUpdateSubmitted";
          readonly installationId: string;
          readonly permissions: readonly PluginHostPermission[];
      }
    | { readonly type: "pluginUninstallSubmitted"; readonly pluginId: string }
    | { readonly type: "pluginUpdateChecksStarted" }
    | { readonly type: "pluginUpdateChecksStopped" };

export type PluginsInput =
    | { readonly type: "pluginsLoading" }
    | { readonly type: "pluginsLoaded"; readonly plugins: readonly PluginCatalogItem[] }
    | { readonly type: "pluginsFailed"; readonly error: UserError }
    | { readonly type: "systemPluginsLoading" }
    | {
          readonly type: "systemPluginsLoaded";
          readonly plugins: readonly SystemPluginSummary[];
      }
    | { readonly type: "systemPluginsFailed"; readonly error: UserError }
    | {
          readonly type: "pluginInstalled";
          readonly shortName: string;
          readonly installation: PluginInstallationSummary;
      }
    | {
          readonly type: "pluginInstallFailed";
          readonly shortName: string;
          readonly error: UserError;
      }
    | {
          readonly type: "pluginPermissionsUpdated";
          readonly installation: PluginInstallationSummary;
      }
    | {
          readonly type: "pluginPermissionsUpdateFailed";
          readonly installationId: string;
          readonly error: UserError;
      }
    | { readonly type: "pluginUninstalled"; readonly pluginId: string }
    | {
          readonly type: "pluginUninstallFailed";
          readonly pluginId: string;
          readonly error: UserError;
      }
    | { readonly type: "pluginUpdateCheckStarted"; readonly pluginId: string }
    | {
          readonly type: "pluginUpdateCheckProgressed";
          readonly pluginId: string;
          readonly progress: PluginPrepareProgress;
      }
    | {
          readonly type: "pluginUpdateChecked";
          readonly pluginId: string;
          readonly update: PluginUpdateCheck;
      }
    | {
          readonly type: "pluginUpdateCheckFailed";
          readonly pluginId: string;
          readonly error: UserError;
      };

export interface PluginsState extends PluginsSnapshot {
    pluginInstall(
        shortName: string,
        variables: Readonly<Record<string, string>>,
        permissions: readonly PluginHostPermission[],
        containerImageId?: string,
    ): void;
    pluginPermissionsUpdate(
        installationId: string,
        permissions: readonly PluginHostPermission[],
    ): void;
    pluginUninstall(pluginId: string): void;
    /** The plugin-management surface became visible; automatic update checks may run. */
    updateChecksStart(): void;
    /** The plugin-management surface is no longer visible; automatic update checks stop. */
    updateChecksStop(): void;
    pluginsInput(event: PluginsInput): void;
}

export type PluginsStore = StoreApi<PluginsState>;
