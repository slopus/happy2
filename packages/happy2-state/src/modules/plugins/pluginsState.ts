import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type PluginCatalogItem,
    type PluginHostPermission,
    type PluginInstallationDiagnostics,
    type PluginInstallationSummary,
    type PluginPrepareProgress,
    type PluginUpdateCheck,
    type PluginUpdateResult,
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

/** One cancel function per installation whose update-check stream is currently open. */
const updateCheckStreams = new WeakMap<PluginsStore, Map<string, () => void>>();

/** One cancel function per installation whose update-commit stream is currently open. */
const updateStreams = new WeakMap<PluginsStore, Map<string, () => void>>();

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
                if (context.plugins.getState().updateChecksActive)
                    context.runtime.background(pluginsUpdateChecksEnsure(context));
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
 * installs, permission replacements, per-installation upgrades, retries,
 * uninstalls, on-demand diagnostics, and the automatic update-check watch that
 * runs only while the plugin-management surface is visible. Every durable
 * mutation reconciles the whole surface afterwards so installations, grants, and
 * health stay authoritative.
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
        case "installationUninstallSubmitted": {
            try {
                await context.runtime.operation("uninstallPluginInstallation", {
                    installationId: event.installationId,
                });
                updateCheckStreamCancel(context.plugins, event.installationId);
                updateStreamCancel(context.plugins, event.installationId);
                context.plugins.getState().pluginsInput({
                    type: "installationUninstalled",
                    installationId: event.installationId,
                });
                await pluginsLoad(context);
            } catch (error) {
                context.plugins.getState().pluginsInput({
                    type: "installationUninstallFailed",
                    installationId: event.installationId,
                    error: userError(error),
                });
            }
            return;
        }
        case "installationRetrySubmitted": {
            try {
                const result = await context.runtime.operation("retryPluginInstallation", {
                    installationId: event.installationId,
                });
                context.plugins.getState().pluginsInput({
                    type: "installationRetried",
                    installation: result.installation,
                });
                await pluginsLoad(context);
                // The retry may have persisted new lastError/diagnosticOutput; refresh
                // an open Logs panel in place without a close/reopen.
                installationDiagnosticsRefresh(context, event.installationId);
            } catch (error) {
                context.plugins.getState().pluginsInput({
                    type: "installationRetryFailed",
                    installationId: event.installationId,
                    error: userError(error),
                });
                installationDiagnosticsRefresh(context, event.installationId);
            }
            return;
        }
        case "installationUpdateSubmitted": {
            await updateStreamOpen(context, event.installationId);
            return;
        }
        case "installationUpdateCheckSubmitted": {
            const streams = updateCheckStreamsFor(context.plugins);
            updateCheckStreamCancel(context.plugins, event.installationId);
            await updateCheckStreamOpen(context, streams, event.installationId);
            return;
        }
        case "installationDiagnosticsRequested": {
            await installationDiagnosticsFetch(context, event.installationId, false);
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
 * Opens one read-only update-check stream for every installed installation whose
 * source can be compared remotely and that has no current result for its
 * installed package digest. Progress and terminal results land through the
 * private writer; streams stay registered so stopping the watch or uninstalling
 * the installation cancels them. Resolves once every stream it opened has
 * terminated or been cancelled.
 */
export async function pluginsUpdateChecksEnsure(context: PluginsActionContext): Promise<void> {
    const snapshot = context.plugins.getState();
    if (!snapshot.updateChecksActive) return;
    if (!context.runtime.active) return;
    const streams = updateCheckStreamsFor(context.plugins);
    const pending: Promise<void>[] = [];
    for (const installation of installationsToCheck(snapshot)) {
        if (streams.has(installation.id)) continue;
        const existing = snapshot.updateChecks.get(installation.id);
        if (
            existing &&
            !(
                existing.status === "checked" &&
                existing.update.installed.packageDigest !== installation.packageDigest
            )
        )
            continue;
        pending.push(updateCheckStreamOpen(context, streams, installation.id));
    }
    await Promise.all(pending);
}

/** Cancels every open update-check stream; the surface stopped watching or is being disposed. */
export function pluginsUpdateChecksStop(plugins: PluginsStore): void {
    const streams = updateCheckStreams.get(plugins);
    if (!streams) return;
    // Each cancel deletes its own entry; Map iteration tolerates that, and the
    // trailing clear() covers any entry a cancel chose not to remove.
    for (const cancel of streams.values()) cancel();
    streams.clear();
}

/** Cancels every open update-commit stream; the state is being disposed. */
export function pluginsUpdateStreamsStop(plugins: PluginsStore): void {
    const streams = updateStreams.get(plugins);
    if (!streams) return;
    for (const cancel of streams.values()) cancel();
    streams.clear();
}

/** The installations whose remote source supports an update comparison, deduplicated by id. */
function installationsToCheck(snapshot: PluginsSnapshot): readonly EligibleInstallation[] {
    if (snapshot.systemPlugins.type !== "ready") return [];
    const result: EligibleInstallation[] = [];
    for (const plugin of snapshot.systemPlugins.value)
        for (const installation of plugin.installations) {
            const sourceKind = installation.sourceKind ?? plugin.sourceKind;
            // Uploaded packages have no remote source and are never checked.
            if (sourceKind === "upload" || sourceKind === "archive") continue;
            result.push({ id: installation.id, packageDigest: installation.packageDigest });
        }
    return result;
}

interface EligibleInstallation {
    readonly id: string;
    readonly packageDigest: string;
}

function updateCheckStreamOpen(
    context: PluginsActionContext,
    streams: Map<string, () => void>,
    installationId: string,
): Promise<void> {
    let terminalResolve!: () => void;
    const terminal = new Promise<void>((resolve) => {
        terminalResolve = resolve;
    });
    let settled = false;
    const settle = () => {
        if (settled) return;
        settled = true;
        streams.delete(installationId);
        terminalResolve();
    };
    context.plugins
        .getState()
        .pluginsInput({ type: "installationUpdateCheckStarted", installationId });
    const cancel = context.runtime.operationStream(
        "checkPluginInstallationUpdate",
        { installationId },
        {
            onEvent: (event) => {
                if (settled) return;
                if (event.event === "progress") {
                    context.plugins.getState().pluginsInput({
                        type: "installationUpdateCheckProgressed",
                        installationId,
                        progress: event.data as PluginPrepareProgress,
                    });
                    return;
                }
                if (event.event === "checked") {
                    const data = event.data as { readonly update: PluginUpdateCheck };
                    context.plugins.getState().pluginsInput({
                        type: "installationUpdateChecked",
                        installationId,
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
                        type: "installationUpdateCheckFailed",
                        installationId,
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
                    type: "installationUpdateCheckFailed",
                    installationId,
                    error: new UserError("The update check ended before a result arrived."),
                });
                settle();
            },
            onError: (error) => {
                if (settled) return;
                context.plugins
                    .getState()
                    .pluginsInput({ type: "installationUpdateCheckFailed", installationId, error });
                settle();
            },
        },
    );
    streams.set(installationId, () => {
        settled = true;
        streams.delete(installationId);
        cancel();
        terminalResolve();
    });
    if (settled) streams.delete(installationId);
    return terminal;
}

/**
 * Opens one update-commit stream for a single installation. Progress lands
 * through the private writer; a terminal `updated` reconciles the surface and a
 * `failed` result becomes a displayable per-installation error. The stream is
 * registered so unwatching or uninstalling cancels it.
 */
function updateStreamOpen(context: PluginsActionContext, installationId: string): Promise<void> {
    const streams = updateStreamsFor(context.plugins);
    if (streams.has(installationId)) return Promise.resolve();
    let terminalResolve!: () => void;
    const terminal = new Promise<void>((resolve) => {
        terminalResolve = resolve;
    });
    let settled = false;
    const settle = () => {
        if (settled) return;
        settled = true;
        streams.delete(installationId);
        terminalResolve();
        // A terminal update result may have persisted new lastError/diagnosticOutput;
        // refresh an open Logs panel in place without a close/reopen.
        installationDiagnosticsRefresh(context, installationId);
    };
    context.plugins.getState().pluginsInput({ type: "installationUpdateStarted", installationId });
    const cancel = context.runtime.operationStream(
        "updatePluginInstallation",
        { installationId },
        {
            onEvent: (event) => {
                if (settled) return;
                if (event.event === "progress") {
                    context.plugins.getState().pluginsInput({
                        type: "installationUpdateProgressed",
                        installationId,
                        progress: event.data as PluginPrepareProgress,
                    });
                    return;
                }
                if (event.event === "updated") {
                    const data = event.data as { readonly update: PluginUpdateResult };
                    context.plugins.getState().pluginsInput({
                        type: "installationUpdated",
                        installationId,
                        update: data.update,
                    });
                    settle();
                    context.runtime.background(pluginsLoad(context));
                    return;
                }
                if (event.event === "failed") {
                    const data = event.data as {
                        readonly error?: string;
                        readonly message?: string;
                    };
                    context.plugins.getState().pluginsInput({
                        type: "installationUpdateFailed",
                        installationId,
                        error: new UserError(
                            data.message ?? "The plugin update failed.",
                            data.error,
                        ),
                    });
                    settle();
                }
            },
            onEnd: () => {
                if (settled) return;
                context.plugins.getState().pluginsInput({
                    type: "installationUpdateFailed",
                    installationId,
                    error: new UserError("The plugin update ended before a result arrived."),
                });
                settle();
            },
            onError: (error) => {
                if (settled) return;
                context.plugins
                    .getState()
                    .pluginsInput({ type: "installationUpdateFailed", installationId, error });
                settle();
            },
        },
    );
    streams.set(installationId, () => {
        settled = true;
        streams.delete(installationId);
        cancel();
        terminalResolve();
    });
    if (settled) streams.delete(installationId);
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

function updateStreamsFor(plugins: PluginsStore): Map<string, () => void> {
    let streams = updateStreams.get(plugins);
    if (!streams) {
        streams = new Map();
        updateStreams.set(plugins, streams);
    }
    return streams;
}

function updateCheckStreamCancel(plugins: PluginsStore, installationId: string): void {
    const cancel = updateCheckStreams.get(plugins)?.get(installationId);
    if (cancel) cancel();
}

function updateStreamCancel(plugins: PluginsStore, installationId: string): void {
    const cancel = updateStreams.get(plugins)?.get(installationId);
    if (cancel) cancel();
}

/**
 * Reads durable diagnostics for one installation and lands the result through the
 * private writer. When `requireMaterialized` is set, a result is only written if a
 * diagnostics panel is still open for that installation, so a background refresh
 * never resurrects a panel the user closed (or an installation that was removed).
 */
async function installationDiagnosticsFetch(
    context: PluginsActionContext,
    installationId: string,
    requireMaterialized: boolean,
): Promise<void> {
    const open = () => context.plugins.getState().diagnostics.has(installationId);
    try {
        const result = await context.runtime.operation("getPluginInstallationDiagnostics", {
            installationId,
        });
        if (requireMaterialized && !open()) return;
        context.plugins.getState().pluginsInput({
            type: "installationDiagnosticsLoaded",
            installationId,
            diagnostics: result.diagnostics,
        });
    } catch (error) {
        if (requireMaterialized && !open()) return;
        context.plugins.getState().pluginsInput({
            type: "installationDiagnosticsFailed",
            installationId,
            error: userError(error),
        });
    }
}

/**
 * Re-reads diagnostics only for an already-materialized panel, in the background
 * and without flashing a loading state, so a retry or update terminal refreshes an
 * open Logs view in place. A closed panel is left untouched.
 */
function installationDiagnosticsRefresh(
    context: PluginsActionContext,
    installationId: string,
): void {
    if (!context.plugins.getState().diagnostics.has(installationId)) return;
    context.runtime.background(installationDiagnosticsFetch(context, installationId, true));
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
        retrying: [],
        updatingPermissions: [],
        updateChecksActive: false,
        updateChecks: new Map(),
        updating: new Map(),
        diagnostics: new Map(),
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
        installationUninstall(installationId): void {
            if (get().uninstalling.includes(installationId)) return;
            set((snapshot) => ({
                ...snapshot,
                uninstalling: [...snapshot.uninstalling, installationId],
                actionError: undefined,
            }));
            output({ type: "installationUninstallSubmitted", installationId });
        },
        installationRetry(installationId): void {
            if (get().retrying.includes(installationId)) return;
            set((snapshot) => ({
                ...snapshot,
                retrying: [...snapshot.retrying, installationId],
                actionError: undefined,
            }));
            output({ type: "installationRetrySubmitted", installationId });
        },
        installationUpdate(installationId): void {
            const current = get().updating.get(installationId);
            if (current?.status === "updating") return;
            set((snapshot) => ({
                ...snapshot,
                updating: mapSet(snapshot.updating, installationId, { status: "updating" }),
                actionError: undefined,
            }));
            output({ type: "installationUpdateSubmitted", installationId });
        },
        installationUpdateCheck(installationId): void {
            output({ type: "installationUpdateCheckSubmitted", installationId });
        },
        installationDiagnosticsLoad(installationId): void {
            const current = get().diagnostics.get(installationId);
            if (current?.status === "loading") return;
            set((snapshot) => ({
                ...snapshot,
                diagnostics: mapSet(snapshot.diagnostics, installationId, { status: "loading" }),
            }));
            output({ type: "installationDiagnosticsRequested", installationId });
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
                    case "installationRetried":
                        return {
                            ...snapshot,
                            retrying: snapshot.retrying.filter(
                                (installationId) => installationId !== event.installation.id,
                            ),
                            catalog: installationUpsert(snapshot.catalog, event.installation),
                            systemPlugins: systemInstallationUpsert(
                                snapshot.systemPlugins,
                                event.installation,
                            ),
                            actionError: undefined,
                        };
                    case "installationRetryFailed":
                        return {
                            ...snapshot,
                            retrying: snapshot.retrying.filter(
                                (installationId) => installationId !== event.installationId,
                            ),
                            actionError: event.error,
                        };
                    case "installationUninstalled":
                        return {
                            ...snapshot,
                            uninstalling: snapshot.uninstalling.filter(
                                (installationId) => installationId !== event.installationId,
                            ),
                            catalog: installationRemove(snapshot.catalog, event.installationId),
                            systemPlugins: systemInstallationRemove(
                                snapshot.systemPlugins,
                                event.installationId,
                            ),
                            updateChecks: mapDelete(snapshot.updateChecks, event.installationId),
                            updating: mapDelete(snapshot.updating, event.installationId),
                            diagnostics: mapDelete(snapshot.diagnostics, event.installationId),
                            actionError: undefined,
                        };
                    case "installationUninstallFailed":
                        return {
                            ...snapshot,
                            uninstalling: snapshot.uninstalling.filter(
                                (installationId) => installationId !== event.installationId,
                            ),
                            actionError: event.error,
                        };
                    case "installationUpdateStarted":
                        return {
                            ...snapshot,
                            updating: mapSet(snapshot.updating, event.installationId, {
                                status: "updating",
                            }),
                        };
                    case "installationUpdateProgressed": {
                        const current = snapshot.updating.get(event.installationId);
                        if (current?.status !== "updating") return snapshot;
                        return {
                            ...snapshot,
                            updating: mapSet(snapshot.updating, event.installationId, {
                                status: "updating",
                                progress: event.progress,
                            }),
                        };
                    }
                    case "installationUpdated":
                        return {
                            ...snapshot,
                            updating: mapDelete(snapshot.updating, event.installationId),
                            // The committed digest changed; drop the stale check result so
                            // the next watch re-checks against the new package.
                            updateChecks: mapDelete(snapshot.updateChecks, event.installationId),
                            actionError: undefined,
                        };
                    case "installationUpdateFailed":
                        return {
                            ...snapshot,
                            updating: mapSet(snapshot.updating, event.installationId, {
                                status: "failed",
                                error: event.error,
                            }),
                            actionError: event.error,
                        };
                    case "installationDiagnosticsLoaded":
                        return {
                            ...snapshot,
                            diagnostics: mapSet(snapshot.diagnostics, event.installationId, {
                                status: "ready",
                                diagnostics: event.diagnostics,
                            }),
                        };
                    case "installationDiagnosticsFailed":
                        return {
                            ...snapshot,
                            diagnostics: mapSet(snapshot.diagnostics, event.installationId, {
                                status: "failed",
                                error: event.error,
                            }),
                        };
                    case "installationUpdateCheckStarted":
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.installationId, {
                                status: "checking",
                            }),
                        };
                    case "installationUpdateCheckProgressed": {
                        const current = snapshot.updateChecks.get(event.installationId);
                        if (current?.status !== "checking") return snapshot;
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.installationId, {
                                status: "checking",
                                progress: event.progress,
                            }),
                        };
                    }
                    case "installationUpdateChecked":
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.installationId, {
                                status: "checked",
                                update: event.update,
                            }),
                        };
                    case "installationUpdateCheckFailed":
                        return {
                            ...snapshot,
                            updateChecks: mapSet(snapshot.updateChecks, event.installationId, {
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

function installationRemove(
    catalog: Loadable<readonly PluginCatalogItem[]>,
    installationId: string,
): Loadable<readonly PluginCatalogItem[]> {
    if (catalog.type !== "ready") return catalog;
    if (
        !catalog.value.some((item) =>
            item.systemPlugin?.installations.some(
                (installation) => installation.id === installationId,
            ),
        )
    )
        return catalog;
    return {
        type: "ready",
        value: catalog.value.map((item) => {
            if (
                !item.systemPlugin ||
                !item.systemPlugin.installations.some(
                    (installation) => installation.id === installationId,
                )
            )
                return item;
            const installations = item.systemPlugin.installations.filter(
                (installation) => installation.id !== installationId,
            );
            // The server removes the plugin row once its last installation is gone.
            if (installations.length === 0) return { ...item, systemPlugin: undefined };
            return { ...item, systemPlugin: { ...item.systemPlugin, installations } };
        }),
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

function systemInstallationRemove(
    plugins: Loadable<readonly SystemPluginSummary[]>,
    installationId: string,
): Loadable<readonly SystemPluginSummary[]> {
    if (plugins.type !== "ready") return plugins;
    if (
        !plugins.value.some((plugin) =>
            plugin.installations.some((installation) => installation.id === installationId),
        )
    )
        return plugins;
    return {
        type: "ready",
        value: plugins.value.flatMap((plugin) => {
            if (!plugin.installations.some((installation) => installation.id === installationId))
                return [plugin];
            const installations = plugin.installations.filter(
                (installation) => installation.id !== installationId,
            );
            // The server removes the plugin row once its last installation is gone.
            if (installations.length === 0) return [];
            return [{ ...plugin, installations }];
        }),
    };
}

function mapSet<V>(map: ReadonlyMap<string, V>, key: string, value: V): ReadonlyMap<string, V> {
    const next = new Map(map);
    next.set(key, value);
    return next;
}

function mapDelete<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
    if (!map.has(key)) return map;
    const next = new Map(map);
    next.delete(key);
    return next;
}

function mapWithout<V>(
    map: ReadonlyMap<string, V>,
    remove: (state: V) => boolean,
): ReadonlyMap<string, V> {
    if (![...map.values()].some(remove)) return map;
    const next = new Map<string, V>();
    for (const [key, state] of map) if (!remove(state)) next.set(key, state);
    return next;
}

export type PluginUpdateCheckState =
    | { readonly status: "checking"; readonly progress?: PluginPrepareProgress }
    | { readonly status: "checked"; readonly update: PluginUpdateCheck }
    | { readonly status: "failed"; readonly error: UserError };

export type PluginInstallationUpdateState =
    | { readonly status: "updating"; readonly progress?: PluginPrepareProgress }
    | { readonly status: "failed"; readonly error: UserError };

export type PluginDiagnosticsState =
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly diagnostics: PluginInstallationDiagnostics }
    | { readonly status: "failed"; readonly error: UserError };

export interface PluginsSnapshot {
    readonly catalog: Loadable<readonly PluginCatalogItem[]>;
    /** Persisted system plugins, including externally sourced packages absent from the catalog. */
    readonly systemPlugins: Loadable<readonly SystemPluginSummary[]>;
    /** Catalog short names whose install request is still in flight. */
    readonly installing: readonly string[];
    /** Installation IDs whose uninstall request is still in flight. */
    readonly uninstalling: readonly string[];
    /** Installation IDs whose retry request is still in flight. */
    readonly retrying: readonly string[];
    /** Installation IDs whose permission replacement is still in flight. */
    readonly updatingPermissions: readonly string[];
    /** True while the plugin-management surface is visible and automatic update checks run. */
    readonly updateChecksActive: boolean;
    /** The latest automatic or manual remote update check per installation ID. */
    readonly updateChecks: ReadonlyMap<string, PluginUpdateCheckState>;
    /** In-flight or failed update-commit operations per installation ID. */
    readonly updating: ReadonlyMap<string, PluginInstallationUpdateState>;
    /** On-demand diagnostics per installation ID. */
    readonly diagnostics: ReadonlyMap<string, PluginDiagnosticsState>;
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
    | { readonly type: "installationUninstallSubmitted"; readonly installationId: string }
    | { readonly type: "installationRetrySubmitted"; readonly installationId: string }
    | { readonly type: "installationUpdateSubmitted"; readonly installationId: string }
    | { readonly type: "installationUpdateCheckSubmitted"; readonly installationId: string }
    | { readonly type: "installationDiagnosticsRequested"; readonly installationId: string }
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
    | {
          readonly type: "installationRetried";
          readonly installation: PluginInstallationSummary;
      }
    | {
          readonly type: "installationRetryFailed";
          readonly installationId: string;
          readonly error: UserError;
      }
    | { readonly type: "installationUninstalled"; readonly installationId: string }
    | {
          readonly type: "installationUninstallFailed";
          readonly installationId: string;
          readonly error: UserError;
      }
    | { readonly type: "installationUpdateStarted"; readonly installationId: string }
    | {
          readonly type: "installationUpdateProgressed";
          readonly installationId: string;
          readonly progress: PluginPrepareProgress;
      }
    | {
          readonly type: "installationUpdated";
          readonly installationId: string;
          readonly update: PluginUpdateResult;
      }
    | {
          readonly type: "installationUpdateFailed";
          readonly installationId: string;
          readonly error: UserError;
      }
    | {
          readonly type: "installationDiagnosticsLoaded";
          readonly installationId: string;
          readonly diagnostics: PluginInstallationDiagnostics;
      }
    | {
          readonly type: "installationDiagnosticsFailed";
          readonly installationId: string;
          readonly error: UserError;
      }
    | { readonly type: "installationUpdateCheckStarted"; readonly installationId: string }
    | {
          readonly type: "installationUpdateCheckProgressed";
          readonly installationId: string;
          readonly progress: PluginPrepareProgress;
      }
    | {
          readonly type: "installationUpdateChecked";
          readonly installationId: string;
          readonly update: PluginUpdateCheck;
      }
    | {
          readonly type: "installationUpdateCheckFailed";
          readonly installationId: string;
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
    /** Uninstalls one installation; the plugin disappears only when its last installation is gone. */
    installationUninstall(installationId: string): void;
    /** Retries activation of a failed or broken installation in place. */
    installationRetry(installationId: string): void;
    /** Downloads and commits the remote update for one installation, streaming progress. */
    installationUpdate(installationId: string): void;
    /** Re-runs the remote update comparison for one installation on demand. */
    installationUpdateCheck(installationId: string): void;
    /** Loads the durable diagnostics/log output for one installation on demand. */
    installationDiagnosticsLoad(installationId: string): void;
    /** The plugin-management surface became visible; automatic update checks may run. */
    updateChecksStart(): void;
    /** The plugin-management surface is no longer visible; automatic update checks stop. */
    updateChecksStop(): void;
    pluginsInput(event: PluginsInput): void;
}

export type PluginsStore = StoreApi<PluginsState>;
