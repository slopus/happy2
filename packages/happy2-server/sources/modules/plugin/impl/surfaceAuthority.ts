import { and, eq, inArray } from "drizzle-orm";
import { chatGetAccess } from "../../chat/chatGetAccess.js";
import { userRequireActive } from "../../chat/userRequireActive.js";
import type { DrizzleExecutor } from "../../drizzle.js";
import {
    pluginAppInstances,
    pluginInstallations,
    pluginMcpAppResources,
    pluginMcpTools,
    pluginUiAssets,
} from "../../schema.js";
import { mcpAppToolVisibleTo } from "./mcpApp.js";
import type {
    PluginContributionSpec,
    PluginInteractiveControl,
    PluginTextControl,
    PluginToolAction,
} from "./surfaceDefinition.js";
import { PluginError } from "../types.js";

export interface PluginSurfaceInstallation {
    installationId: string;
    pluginId: string;
}

export async function pluginSurfaceInstallationRequire(
    executor: DrizzleExecutor,
    installationId: string,
): Promise<PluginSurfaceInstallation> {
    const [installation] = await executor
        .select({ installationId: pluginInstallations.id, pluginId: pluginInstallations.pluginId })
        .from(pluginInstallations)
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
    return installation;
}

export async function pluginSurfaceAudienceRequire(
    executor: DrizzleExecutor,
    input: { scope: "all_users" | "user"; viewerUserId?: string; chatId?: string },
): Promise<string | undefined> {
    if (input.scope === "user" && !input.viewerUserId)
        throw new PluginError(
            "forbidden",
            "A user-scoped plugin surface requires current-viewer authority",
        );
    if (input.viewerUserId) await userRequireActive(executor, input.viewerUserId);
    if (input.chatId) {
        if (
            !input.viewerUserId ||
            !(await chatGetAccess(executor, input.viewerUserId, input.chatId, true))
        )
            throw new PluginError(
                "forbidden",
                "A chat-scoped plugin surface requires current member authority",
            );
    }
    return input.scope === "user" ? input.viewerUserId : undefined;
}

export async function pluginAppDependenciesRequire(
    executor: DrizzleExecutor,
    installation: PluginSurfaceInstallation,
    resourceUri: string,
    assetId: string,
): Promise<void> {
    const [[resource], [asset]] = await Promise.all([
        executor
            .select({ uri: pluginMcpAppResources.uri })
            .from(pluginMcpAppResources)
            .where(
                and(
                    eq(pluginMcpAppResources.installationId, installation.installationId),
                    eq(pluginMcpAppResources.uri, resourceUri),
                ),
            )
            .limit(1),
        executor
            .select({ assetId: pluginUiAssets.assetId })
            .from(pluginUiAssets)
            .where(
                and(
                    eq(pluginUiAssets.installationId, installation.installationId),
                    eq(pluginUiAssets.assetId, assetId),
                ),
            )
            .limit(1),
    ]);
    if (!resource)
        throw new PluginError("broken_configuration", "App resource is not in this installation");
    if (!asset)
        throw new PluginError("broken_configuration", "App asset is not owned by this plugin");
}

export async function pluginContributionDependenciesRequire(
    executor: DrizzleExecutor,
    installation: PluginSurfaceInstallation,
    spec: PluginContributionSpec,
): Promise<void> {
    const dependencies = contributionDependencies(spec);
    if (dependencies.assets.size) {
        const assets = await executor
            .select({ assetId: pluginUiAssets.assetId })
            .from(pluginUiAssets)
            .where(
                and(
                    eq(pluginUiAssets.installationId, installation.installationId),
                    inArray(pluginUiAssets.assetId, [...dependencies.assets]),
                ),
            );
        if (assets.length !== dependencies.assets.size)
            throw new PluginError(
                "broken_configuration",
                "Contribution references an asset not owned by this plugin",
            );
    }
    if (dependencies.tools.size) {
        const tools = await executor
            .select({ name: pluginMcpTools.name, metaJson: pluginMcpTools.metaJson })
            .from(pluginMcpTools)
            .where(
                and(
                    eq(pluginMcpTools.installationId, installation.installationId),
                    inArray(pluginMcpTools.name, [...dependencies.tools]),
                ),
            );
        if (tools.length !== dependencies.tools.size)
            throw new PluginError(
                "broken_configuration",
                "Contribution references a missing installation tool",
            );
        for (const tool of tools) {
            const meta = metadata(tool.metaJson, tool.name);
            if (!mcpAppToolVisibleTo(meta, "app"))
                throw new PluginError(
                    "broken_configuration",
                    `Contribution tool ${tool.name} is not visible to apps`,
                );
        }
    }
    if (dependencies.apps.size) {
        const apps = await executor
            .select({
                instanceKey: pluginAppInstances.instanceKey,
                resourceUri: pluginAppInstances.resourceUri,
                assetId: pluginAppInstances.assetId,
            })
            .from(pluginAppInstances)
            .where(
                and(
                    eq(pluginAppInstances.installationId, installation.installationId),
                    inArray(pluginAppInstances.instanceKey, [...dependencies.apps]),
                ),
            );
        if (apps.length !== dependencies.apps.size)
            throw new PluginError(
                "broken_configuration",
                "Contribution references a missing installation app instance",
            );
        for (const app of apps)
            await pluginAppDependenciesRequire(
                executor,
                installation,
                app.resourceUri,
                app.assetId,
            );
    }
}

export async function pluginContributionDependenciesAvailable(
    executor: DrizzleExecutor,
    installation: PluginSurfaceInstallation,
    spec: PluginContributionSpec,
): Promise<boolean> {
    try {
        await pluginContributionDependenciesRequire(executor, installation, spec);
        return true;
    } catch (error) {
        if (error instanceof PluginError) return false;
        throw error;
    }
}

export async function pluginSurfaceViewerRequire(
    executor: DrizzleExecutor,
    viewerUserId: string,
): Promise<void> {
    await userRequireActive(executor, viewerUserId);
}

export async function pluginSurfaceChatVisible(
    executor: DrizzleExecutor,
    viewerUserId: string,
    chatId: string | null,
): Promise<boolean> {
    return !chatId || Boolean(await chatGetAccess(executor, viewerUserId, chatId, true));
}

function contributionDependencies(spec: PluginContributionSpec): {
    assets: Set<string>;
    tools: Set<string>;
    apps: Set<string>;
} {
    const assets = new Set<string>();
    const tools = new Set<string>();
    const apps = new Set<string>();
    const addAction = (action: PluginToolAction) => {
        tools.add(action.toolName);
        if (action.openApp) apps.add(action.openApp.instanceKey);
    };
    const visit = (
        control: PluginContributionSpec | PluginInteractiveControl | PluginTextControl,
    ) => {
        if (control.kind === "button") {
            assets.add(control.assetId);
            addAction(control.action);
        } else if (
            control.kind === "checkbox" ||
            control.kind === "checkboxGroup" ||
            control.kind === "input"
        ) {
            addAction(control.action);
        } else if (control.kind === "staticMenu") {
            control.items.forEach(visit);
        } else if (control.kind === "asyncMenu") {
            tools.add(control.resolverToolName);
        } else if (control.kind === "section") {
            control.controls.forEach(visit);
        }
    };
    visit(spec);
    return { assets, tools, apps };
}

function metadata(source: string | null, toolName: string): Record<string, unknown> | undefined {
    if (!source) return undefined;
    try {
        const value: unknown = JSON.parse(source);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return value as Record<string, unknown>;
    } catch {
        throw new PluginError(
            "broken_configuration",
            `Persisted metadata for plugin tool ${toolName} is invalid`,
        );
    }
}
