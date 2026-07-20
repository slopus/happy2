import { createId } from "@paralleldrive/cuid2";
import { and, count, eq, sql } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginContributions } from "../schema.js";
import {
    pluginContributionDefinitionParse,
    pluginPositionEncode,
    pluginSurfaceJson,
} from "./impl/surfaceDefinition.js";
import {
    pluginContributionDependenciesRequire,
    pluginSurfaceAudienceRequire,
    pluginSurfaceInstallationRequire,
} from "./impl/surfaceAuthority.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";

const CHAT_PLACEMENTS = new Set(["chatMenu", "composerIcon", "composerMenu", "messageMenu"]);

/**
 * Idempotently creates or shape-updates one pluginContributions row after enforcing placement, app-visible tools, assets, app targets, audience, quota, and optional revision invariants.
 * The validated native definition and sync evidence commit together so product chrome never observes an unbound action.
 */
export async function pluginContributionPut(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        viewerUserId?: string;
        chatId?: string;
        definition: unknown;
    },
): Promise<{ created: boolean; id: string; revision: number; hint: MutationHint }> {
    const definition = pluginContributionDefinitionParse(input.definition);
    if (input.chatId && !CHAT_PLACEMENTS.has(definition.location))
        throw new PluginError(
            "broken_configuration",
            `${definition.location} contributions cannot be scoped to a chat`,
        );
    return withTransaction(executor, async (tx) => {
        const installation = await pluginSurfaceInstallationRequire(tx, input.installationId);
        const ownerUserId = await pluginSurfaceAudienceRequire(tx, {
            scope: definition.audience.scope,
            viewerUserId: input.viewerUserId,
            chatId: input.chatId,
        });
        await pluginContributionDependenciesRequire(tx, installation, definition.spec);
        const [current] = await tx
            .select({
                id: pluginContributions.id,
                revision: pluginContributions.revision,
                ownerUserId: pluginContributions.ownerUserId,
                chatId: pluginContributions.chatId,
            })
            .from(pluginContributions)
            .where(
                and(
                    eq(pluginContributions.installationId, input.installationId),
                    eq(pluginContributions.contributionKey, definition.externalKey),
                ),
            )
            .limit(1);
        if (
            current?.ownerUserId &&
            (!input.viewerUserId || current.ownerUserId !== input.viewerUserId)
        )
            throw new PluginError(
                "forbidden",
                "A user-scoped contribution can only be changed for its current owner",
            );
        if (current?.chatId && current.chatId !== input.chatId)
            throw new PluginError("forbidden", "Contribution belongs to another chat");
        if (definition.revision !== undefined && definition.revision !== current?.revision)
            throw new PluginError("conflict", "Contribution revision changed");
        if (!current) {
            const [{ total }] = await tx
                .select({ total: count() })
                .from(pluginContributions)
                .where(eq(pluginContributions.installationId, input.installationId));
            if (total >= 128)
                throw new PluginError(
                    "broken_configuration",
                    "Plugin installation has reached its 128 contribution limit",
                );
        }
        const id = current?.id ?? createId();
        const revision = (current?.revision ?? 0) + 1;
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "contributions",
            kind: "plugin.contribution_changed",
            entityId: id,
            actorUserId: input.viewerUserId,
            targetUserId: ownerUserId,
            chatId: input.chatId,
        });
        const values = {
            placement: definition.location,
            title: definition.title,
            description: definition.description,
            specJson: pluginSurfaceJson(definition.spec),
            scope: definition.audience.scope,
            ownerUserId: ownerUserId ?? null,
            chatId: input.chatId ?? null,
            position: pluginPositionEncode(definition.position),
            revision,
            syncSequence: mutation.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        } as const;
        if (current) {
            await tx.update(pluginContributions).set(values).where(eq(pluginContributions.id, id));
        } else {
            await tx.insert(pluginContributions).values({
                id,
                installationId: input.installationId,
                contributionKey: definition.externalKey,
                ...values,
            });
        }
        return { created: !current, id, revision, hint: mutation.hint };
    });
}
