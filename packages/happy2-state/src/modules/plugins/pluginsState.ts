import { createStore, type StoreApi } from "zustand/vanilla";
import { type PluginCatalogItem, type PluginInstallationSummary } from "../../resources.js";
import { type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface PluginsActionContext {
    readonly runtime: StateRuntime;
    readonly plugins: PluginsStore;
}

const generations = new WeakMap<PluginsStore, number>();

/** Loads the administrator plugin catalog with per-package installations; reads never contain configured variable values. */
export async function pluginsLoad(context: PluginsActionContext): Promise<void> {
    const generation = (generations.get(context.plugins) ?? 0) + 1;
    generations.set(context.plugins, generation);
    context.plugins.getState().pluginsInput({ type: "pluginsLoading" });
    try {
        const result = await context.runtime.operation("getPluginCatalog");
        if (generations.get(context.plugins) !== generation) return;
        context.plugins.getState().pluginsInput({ type: "pluginsLoaded", plugins: result.plugins });
    } catch (error) {
        if (generations.get(context.plugins) === generation)
            context.plugins
                .getState()
                .pluginsInput({ type: "pluginsFailed", error: userError(error) });
    }
}

/** Performs one durable catalog install, then reconciles the whole catalog so the new installation and its health are authoritative. */
export async function pluginsOutputRoute(
    context: PluginsActionContext,
    event: PluginsOutput,
): Promise<void> {
    try {
        const result = await context.runtime.operation("installPlugin", {
            shortName: event.shortName,
            ...(Object.keys(event.variables).length ? { variables: event.variables } : {}),
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
}

/** Creates the plugin catalog surface; secret variable values exist only transiently inside the typed install output event. */
export function pluginsStoreCreate(
    output: (event: PluginsOutput) => void = () => undefined,
): PluginsStore {
    return createStore<PluginsState>()((set) => ({
        catalog: { type: "unloaded" },
        installing: [],
        pluginInstall(shortName, variables, containerImageId): void {
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
                ...(containerImageId ? { containerImageId } : {}),
            });
        },
        pluginsInput(event): void {
            set((snapshot) => {
                if (event.type === "pluginsLoading")
                    return { ...snapshot, catalog: { type: "loading" } };
                if (event.type === "pluginsFailed")
                    return { ...snapshot, catalog: { type: "error", error: event.error } };
                if (event.type === "pluginsLoaded")
                    return { ...snapshot, catalog: { type: "ready", value: event.plugins } };
                if (event.type === "pluginInstallFailed")
                    return {
                        ...snapshot,
                        installing: snapshot.installing.filter(
                            (shortName) => shortName !== event.shortName,
                        ),
                        actionError: event.error,
                    };
                return {
                    ...snapshot,
                    installing: snapshot.installing.filter(
                        (shortName) => shortName !== event.shortName,
                    ),
                    catalog: installationUpsert(snapshot.catalog, event.installation),
                    actionError: undefined,
                };
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

export interface PluginsSnapshot {
    readonly catalog: Loadable<readonly PluginCatalogItem[]>;
    /** Catalog short names whose install request is still in flight. */
    readonly installing: readonly string[];
    readonly actionError?: UserError;
}

export type PluginsOutput = {
    readonly type: "pluginInstallSubmitted";
    readonly shortName: string;
    readonly variables: Readonly<Record<string, string>>;
    readonly containerImageId?: string;
};

export type PluginsInput =
    | { readonly type: "pluginsLoading" }
    | { readonly type: "pluginsLoaded"; readonly plugins: readonly PluginCatalogItem[] }
    | { readonly type: "pluginsFailed"; readonly error: UserError }
    | {
          readonly type: "pluginInstalled";
          readonly shortName: string;
          readonly installation: PluginInstallationSummary;
      }
    | {
          readonly type: "pluginInstallFailed";
          readonly shortName: string;
          readonly error: UserError;
      };

export interface PluginsState extends PluginsSnapshot {
    pluginInstall(
        shortName: string,
        variables: Readonly<Record<string, string>>,
        containerImageId?: string,
    ): void;
    pluginsInput(event: PluginsInput): void;
}

export type PluginsStore = StoreApi<PluginsState>;
