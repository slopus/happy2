import { and, eq, isNull, or } from "drizzle-orm";
import type { DrizzleExecutor } from "../../drizzle.js";
import {
    appPresentationPreferences,
    pluginAppInstances,
    pluginContributions,
    pluginInstallations,
    pluginMcpAppResources,
    plugins,
    pluginUiAssets,
} from "../../schema.js";
import {
    pluginContributionDefinitionParse,
    pluginPositionDecode,
    type JsonObject,
    type PluginAppPresentation,
    type PluginContributionPlacement,
    type PluginContributionSpec,
} from "./surfaceDefinition.js";
import {
    pluginContributionDependenciesAvailable,
    pluginSurfaceChatVisible,
} from "./surfaceAuthority.js";

export interface PluginAppInstanceSummary {
    id: string;
    installationId: string;
    pluginId: string;
    pluginShortName: string;
    instanceKey: string;
    resourceUri: string;
    title: string;
    description: string;
    assetId: string;
    available: boolean;
    context: JsonObject;
    dataRevision: number;
    scope: "all_users" | "user";
    ownerUserId?: string;
    chatId?: string;
    presentation: PluginAppPresentation;
    position: number;
    revision: number;
    hidden: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PluginContributionSummary {
    id: string;
    installationId: string;
    pluginId: string;
    pluginShortName: string;
    externalKey: string;
    location: PluginContributionPlacement;
    title: string;
    description: string;
    spec: PluginContributionSpec;
    available: boolean;
    scope: "all_users" | "user";
    ownerUserId?: string;
    chatId?: string;
    position: number;
    revision: number;
    createdAt: string;
    updatedAt: string;
}

export async function pluginAppInstanceProjectionList(
    executor: DrizzleExecutor,
    viewerUserId: string,
    id?: string,
): Promise<PluginAppInstanceSummary[]> {
    const rows = await executor
        .select({
            id: pluginAppInstances.id,
            installationId: pluginAppInstances.installationId,
            pluginId: pluginInstallations.pluginId,
            pluginShortName: plugins.shortName,
            instanceKey: pluginAppInstances.instanceKey,
            resourceUri: pluginAppInstances.resourceUri,
            title: pluginAppInstances.title,
            description: pluginAppInstances.description,
            assetId: pluginAppInstances.assetId,
            resourceAvailable: pluginMcpAppResources.uri,
            assetAvailable: pluginUiAssets.assetId,
            contextJson: pluginAppInstances.contextJson,
            dataRevision: pluginAppInstances.dataRevision,
            scope: pluginAppInstances.scope,
            ownerUserId: pluginAppInstances.ownerUserId,
            chatId: pluginAppInstances.chatId,
            presentation: pluginAppInstances.presentation,
            position: pluginAppInstances.position,
            revision: pluginAppInstances.revision,
            hidden: appPresentationPreferences.hidden,
            preferencePosition: appPresentationPreferences.position,
            createdAt: pluginAppInstances.createdAt,
            updatedAt: pluginAppInstances.updatedAt,
        })
        .from(pluginAppInstances)
        .innerJoin(
            pluginInstallations,
            eq(pluginInstallations.id, pluginAppInstances.installationId),
        )
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .leftJoin(
            pluginMcpAppResources,
            and(
                eq(pluginMcpAppResources.installationId, pluginAppInstances.installationId),
                eq(pluginMcpAppResources.uri, pluginAppInstances.resourceUri),
            ),
        )
        .leftJoin(
            pluginUiAssets,
            and(
                eq(pluginUiAssets.installationId, pluginInstallations.id),
                eq(pluginUiAssets.assetId, pluginAppInstances.assetId),
            ),
        )
        .leftJoin(
            appPresentationPreferences,
            and(
                eq(appPresentationPreferences.instanceId, pluginAppInstances.id),
                eq(appPresentationPreferences.userId, viewerUserId),
            ),
        )
        .where(
            and(
                id ? eq(pluginAppInstances.id, id) : undefined,
                or(
                    eq(pluginAppInstances.scope, "all_users"),
                    and(
                        eq(pluginAppInstances.scope, "user"),
                        eq(pluginAppInstances.ownerUserId, viewerUserId),
                    ),
                ),
            ),
        )
        .orderBy(pluginAppInstances.position, pluginAppInstances.id);
    const visible: PluginAppInstanceSummary[] = [];
    for (const row of rows) {
        if (!(await pluginSurfaceChatVisible(executor, viewerUserId, row.chatId))) continue;
        if (row.scope !== "all_users" && row.scope !== "user")
            throw new Error("Persisted app audience is invalid");
        if (row.presentation !== "sidebar" && row.presentation !== "detached")
            throw new Error("Persisted app presentation is invalid");
        visible.push({
            id: row.id,
            installationId: row.installationId,
            pluginId: row.pluginId,
            pluginShortName: row.pluginShortName,
            instanceKey: row.instanceKey,
            resourceUri: row.resourceUri,
            title: row.title,
            description: row.description,
            assetId: row.assetId,
            available: Boolean(row.resourceAvailable && row.assetAvailable),
            context: persistedObject(row.contextJson, "app context"),
            dataRevision: row.dataRevision,
            scope: row.scope,
            ...(row.ownerUserId ? { ownerUserId: row.ownerUserId } : {}),
            ...(row.chatId ? { chatId: row.chatId } : {}),
            presentation: row.presentation,
            position: pluginPositionDecode(row.preferencePosition ?? row.position),
            revision: row.revision,
            hidden: row.hidden ?? false,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }
    return visible.sort(
        (left, right) => left.position - right.position || left.id.localeCompare(right.id),
    );
}

export async function pluginContributionProjectionList(
    executor: DrizzleExecutor,
    input: { viewerUserId: string; chatId?: string },
): Promise<PluginContributionSummary[]> {
    const rows = await executor
        .select({
            id: pluginContributions.id,
            installationId: pluginContributions.installationId,
            pluginId: pluginInstallations.pluginId,
            pluginShortName: plugins.shortName,
            externalKey: pluginContributions.contributionKey,
            location: pluginContributions.placement,
            title: pluginContributions.title,
            description: pluginContributions.description,
            specJson: pluginContributions.specJson,
            scope: pluginContributions.scope,
            ownerUserId: pluginContributions.ownerUserId,
            chatId: pluginContributions.chatId,
            position: pluginContributions.position,
            revision: pluginContributions.revision,
            createdAt: pluginContributions.createdAt,
            updatedAt: pluginContributions.updatedAt,
        })
        .from(pluginContributions)
        .innerJoin(
            pluginInstallations,
            eq(pluginInstallations.id, pluginContributions.installationId),
        )
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(
            and(
                or(
                    eq(pluginContributions.scope, "all_users"),
                    and(
                        eq(pluginContributions.scope, "user"),
                        eq(pluginContributions.ownerUserId, input.viewerUserId),
                    ),
                ),
                input.chatId
                    ? or(
                          isNull(pluginContributions.chatId),
                          eq(pluginContributions.chatId, input.chatId),
                      )
                    : isNull(pluginContributions.chatId),
            ),
        )
        .orderBy(pluginContributions.position, pluginContributions.id);
    const result: PluginContributionSummary[] = [];
    for (const row of rows) {
        if (row.scope !== "all_users" && row.scope !== "user")
            throw new Error("Persisted contribution audience is invalid");
        const definition = pluginContributionDefinitionParse({
            audience: { scope: row.scope },
            description: row.description,
            externalKey: row.externalKey,
            location: row.location,
            position: pluginPositionDecode(row.position),
            revision: row.revision,
            spec: persistedObject(row.specJson, "contribution spec"),
            title: row.title,
        });
        result.push({
            id: row.id,
            installationId: row.installationId,
            pluginId: row.pluginId,
            pluginShortName: row.pluginShortName,
            externalKey: row.externalKey,
            location: definition.location,
            title: definition.title,
            description: definition.description,
            spec: definition.spec,
            available: await pluginContributionDependenciesAvailable(
                executor,
                { installationId: row.installationId, pluginId: row.pluginId },
                definition.spec,
            ),
            scope: row.scope,
            ...(row.ownerUserId ? { ownerUserId: row.ownerUserId } : {}),
            ...(row.chatId ? { chatId: row.chatId } : {}),
            position: definition.position,
            revision: row.revision,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }
    return result;
}

function persistedObject(source: string, label: string): JsonObject {
    try {
        const value: unknown = JSON.parse(source);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return value as JsonObject;
    } catch {
        throw new Error(`Persisted ${label} is invalid`);
    }
}
