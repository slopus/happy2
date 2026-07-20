import { createId } from "@paralleldrive/cuid2";
import { count, eq, sql } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginAppInstances } from "../schema.js";
import {
    pluginAppDefinitionParse,
    pluginPositionEncode,
    pluginSurfaceJson,
} from "./impl/surfaceDefinition.js";
import {
    pluginAppDependenciesRequire,
    pluginSurfaceAudienceRequire,
    pluginSurfaceInstallationRequire,
} from "./impl/surfaceAuthority.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";
import { pluginMcpAppResourceGet } from "./pluginMcpAppResourceGet.js";

/**
 * Idempotently creates or shape-updates one installation-owned pluginAppInstances row while enforcing its cached resource, package asset, audience, quota, and optional revision guard.
 * The app definition and sync evidence commit in one transaction so host routes cannot publish a partially authorized destination.
 */
export async function pluginAppInstancePut(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        viewerUserId?: string;
        chatId?: string;
        definition: unknown;
    },
): Promise<{
    created: boolean;
    id: string;
    revision: number;
    dataRevision: number;
    hint: MutationHint;
}> {
    const definition = pluginAppDefinitionParse(input.definition);
    return withTransaction(executor, async (tx) => {
        const installation = await pluginSurfaceInstallationRequire(tx, input.installationId);
        const ownerUserId = await pluginSurfaceAudienceRequire(tx, {
            scope: definition.audience.scope,
            viewerUserId: input.viewerUserId,
            chatId: input.chatId,
        });
        await pluginAppDependenciesRequire(
            tx,
            installation,
            definition.resourceUri,
            definition.assetId,
        );
        const resource = await pluginMcpAppResourceGet(
            tx,
            input.installationId,
            definition.resourceUri,
        );
        const [current] = await tx
            .select({
                id: pluginAppInstances.id,
                revision: pluginAppInstances.revision,
                dataRevision: pluginAppInstances.dataRevision,
                ownerUserId: pluginAppInstances.ownerUserId,
                chatId: pluginAppInstances.chatId,
            })
            .from(pluginAppInstances)
            .where(
                sql`${pluginAppInstances.installationId} = ${input.installationId} and ${pluginAppInstances.instanceKey} = ${definition.instanceKey}`,
            )
            .limit(1);
        if (
            current?.ownerUserId &&
            (!input.viewerUserId || current.ownerUserId !== input.viewerUserId)
        )
            throw new PluginError(
                "forbidden",
                "A user-scoped app instance can only be changed for its current owner",
            );
        if (current?.chatId && current.chatId !== input.chatId)
            throw new PluginError("forbidden", "App instance belongs to another chat");
        if (definition.revision !== undefined && definition.revision !== current?.revision)
            throw new PluginError("conflict", "App instance revision changed");
        if (!current) {
            const [{ total }] = await tx
                .select({ total: count() })
                .from(pluginAppInstances)
                .where(eq(pluginAppInstances.installationId, input.installationId));
            if (total >= 64)
                throw new PluginError(
                    "broken_configuration",
                    "Plugin installation has reached its 64 app instance limit",
                );
        }
        const id = current?.id ?? createId();
        const revision = (current?.revision ?? 0) + 1;
        const dataRevision = current ? current.dataRevision + 1 : 0;
        if (!Number.isSafeInteger(dataRevision))
            throw new PluginError("conflict", "App instance data revision is exhausted");
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "apps",
            kind: "plugin.app_instance_changed",
            entityId: id,
            actorUserId: input.viewerUserId,
            targetUserId: ownerUserId,
            chatId: input.chatId,
        });
        const values = {
            resourceUri: definition.resourceUri,
            resourceHtml: resource.html,
            resourceContentHashSha256: resource.contentHashSha256,
            resourceCspJson: resource.csp ? pluginSurfaceJson(resource.csp) : null,
            resourcePermissionsJson: resource.permissions
                ? pluginSurfaceJson(resource.permissions)
                : null,
            resourceDomain: resource.domain ?? null,
            resourcePrefersBorder: resource.prefersBorder ?? null,
            title: definition.title,
            description: definition.description,
            assetId: definition.assetId,
            contextJson: pluginSurfaceJson(definition.context),
            dataRevision,
            scope: definition.audience.scope,
            ownerUserId: ownerUserId ?? null,
            chatId: input.chatId ?? null,
            presentation: definition.presentation,
            position: pluginPositionEncode(definition.position),
            revision,
            syncSequence: mutation.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        } as const;
        if (current) {
            await tx.update(pluginAppInstances).set(values).where(eq(pluginAppInstances.id, id));
        } else {
            await tx.insert(pluginAppInstances).values({
                id,
                installationId: input.installationId,
                instanceKey: definition.instanceKey,
                ...values,
                createdByUserId: input.viewerUserId,
            });
        }
        return { created: !current, id, revision, dataRevision, hint: mutation.hint };
    });
}
