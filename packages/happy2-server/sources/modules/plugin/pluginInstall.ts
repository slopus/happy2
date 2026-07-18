import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import {
    agentImages,
    pluginInstallations,
    pluginInstallationVariables,
    plugins,
} from "../schema.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import type { PluginSecretProtector } from "./secrets.js";
import {
    PluginError,
    type PluginInstallationSummary,
    type PluginManifest,
    type PluginPackage,
} from "./types.js";
import { pluginInstallationSelection } from "./impl/installationSelection.js";
import { asPluginInstallation } from "./impl/asInstallation.js";
import { installedManifest } from "./impl/installedManifest.js";

const MAX_VARIABLE_BYTES = 64 * 1024;

export interface PluginPackageCandidate {
    pluginId: string;
    packageDirectory: string;
    imageStorageKey: string;
}

/**
 * Ensures one catalog package has a durable system plugin, then creates an independent installation with its own encrypted variables and container choice.
 * The transaction commits plugins, pluginInstallations, pluginInstallationVariables, audit, and sync evidence together so no installation can reference a partial plugin record.
 */
export async function pluginInstall(
    executor: DrizzleExecutor,
    secretProtector: PluginSecretProtector,
    input: {
        actorUserId: string;
        installationId: string;
        plugin: PluginPackage;
        candidate?: PluginPackageCandidate;
        variables: Readonly<Record<string, string>>;
        containerImageId?: string;
    },
): Promise<{
    hint: MutationHint;
    installation: PluginInstallationSummary;
    pluginCreated: boolean;
    pluginId: string;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        const [existing] = await tx
            .select({ id: plugins.id, manifestJson: plugins.manifestJson })
            .from(plugins)
            .where(
                and(
                    eq(plugins.sourceKind, input.plugin.source.kind),
                    eq(plugins.sourceReference, input.plugin.source.reference),
                ),
            )
            .limit(1);
        let pluginId: string;
        let manifest: PluginManifest;
        let pluginCreated = false;
        if (existing) {
            pluginId = existing.id;
            manifest = installedManifest(existing.manifestJson);
        } else {
            if (!input.candidate)
                throw new Error("A new system plugin requires a persisted package candidate");
            pluginId = input.candidate.pluginId;
            manifest = input.plugin.manifest;
            await tx.insert(plugins).values({
                id: pluginId,
                displayName: manifest.displayName,
                shortName: manifest.shortName,
                description: manifest.description,
                sourceKind: input.plugin.source.kind,
                sourceReference: input.plugin.source.reference,
                sourceVersion: manifest.version,
                packageDigest: input.plugin.packageDigest,
                manifestJson: JSON.stringify(manifest),
                packageDirectory: input.candidate.packageDirectory,
                imageStorageKey: input.candidate.imageStorageKey,
                imageContentType: input.plugin.image.contentType,
                imageSize: input.plugin.image.size,
                imageWidth: input.plugin.image.width,
                imageHeight: input.plugin.image.height,
                imageThumbhash: input.plugin.image.thumbhash,
                imageChecksumSha256: input.plugin.image.checksumSha256,
                installedByUserId: input.actorUserId,
            });
            pluginCreated = true;
        }

        const definitions = manifest.variables;
        const mcp = manifest.mcp;
        validateVariables(definitions, input.variables);
        const selectionRequired = mcp?.type === "stdio" && !mcp.container;
        if (selectionRequired && !input.containerImageId)
            throw new PluginError(
                "broken_configuration",
                "containerImageId is required for this stdio MCP plugin",
            );
        if (!selectionRequired && input.containerImageId)
            throw new PluginError(
                "broken_configuration",
                "containerImageId is not accepted for this plugin",
            );
        if (input.containerImageId) {
            const [image] = await tx
                .select({ id: agentImages.id })
                .from(agentImages)
                .where(
                    and(
                        eq(agentImages.id, input.containerImageId),
                        eq(agentImages.status, "ready"),
                    ),
                )
                .limit(1);
            if (!image)
                throw new PluginError(
                    "broken_configuration",
                    "The selected container image does not exist or is not ready",
                );
        }

        const id = input.installationId;
        const status = mcp ? "preparing" : "ready";
        const [created] = await tx
            .insert(pluginInstallations)
            .values({
                id,
                pluginId,
                containerImageId: input.containerImageId,
                containerName: mcp?.type === "stdio" ? `happy2-plugin-${id}` : null,
                status,
                statusDetail: mcp
                    ? "Plugin runtime is queued for preparation."
                    : "Plugin skills are installed.",
                installedByUserId: input.actorUserId,
                readyAt: mcp ? null : new Date().toISOString(),
            })
            .returning({ id: pluginInstallations.id });
        if (!created) throw new Error("Plugin installation was not created");
        for (const definition of definitions) {
            const value = input.variables[definition.key]!;
            await tx.insert(pluginInstallationVariables).values({
                installationId: id,
                key: definition.key,
                kind: definition.kind,
                ...(definition.kind === "secret"
                    ? {
                          secretCiphertext: await secretProtector.protect(value, {
                              installationId: id,
                              key: definition.key,
                          }),
                      }
                    : { textValue: value }),
            });
        }
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.installed",
            targetType: "plugin_installation",
            targetId: id,
            after: {
                pluginId,
                shortName: manifest.shortName,
                version: manifest.version,
                mcpType: mcp?.type,
                variableKeys: definitions.map(({ key }) => key),
                containerImageId: input.containerImageId,
            },
        });
        const sequence = await syncSequenceNext(tx);
        if (pluginCreated)
            await tx
                .update(plugins)
                .set({ syncSequence: sequence })
                .where(eq(plugins.id, pluginId));
        const [updated] = await tx
            .update(pluginInstallations)
            .set({ syncSequence: sequence })
            .where(eq(pluginInstallations.id, id))
            .returning({ id: pluginInstallations.id });
        if (!updated) throw new Error("Plugin installation was not updated");
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.installed",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        const [projection] = await tx
            .select(pluginInstallationSelection)
            .from(pluginInstallations)
            .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
            .where(eq(pluginInstallations.id, id))
            .limit(1);
        if (!projection) throw new Error("Plugin installation projection was not found");
        return {
            hint: areaHint(sequence, "plugins"),
            installation: asPluginInstallation(projection),
            pluginCreated,
            pluginId,
        };
    });
}

function validateVariables(
    definitions: PluginManifest["variables"],
    values: Readonly<Record<string, string>>,
): void {
    const expected = new Set(definitions.map(({ key }) => key));
    const unexpected = Object.keys(values).find((key) => !expected.has(key));
    if (unexpected)
        throw new PluginError("broken_configuration", `Unexpected plugin variable ${unexpected}`);
    for (const definition of definitions) {
        const value = values[definition.key];
        if (
            typeof value !== "string" ||
            !value ||
            value.includes("\u0000") ||
            Buffer.byteLength(value, "utf8") > MAX_VARIABLE_BYTES
        )
            throw new PluginError(
                "broken_configuration",
                `${definition.key} must be a valid environment value between 1 byte and 64 KiB`,
            );
    }
}
