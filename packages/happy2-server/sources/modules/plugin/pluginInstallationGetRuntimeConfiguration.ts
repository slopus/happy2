import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import {
    agentImages,
    pluginInstallations,
    pluginInstallationVariables,
    plugins,
} from "../schema.js";
import type { PluginSecretProtector } from "./secrets.js";
import { PluginError, type PluginRuntimeConfiguration } from "./types.js";
import { installedManifest } from "./impl/installedManifest.js";
import { effectiveContainer } from "./impl/effectiveContainer.js";
import { pluginPermissionsParse, pluginPermissionsValidate } from "./impl/apiPermissions.js";

/**
 * Resolves one installed manifest into its private runtime configuration, revealing encrypted values only for process environment or remote header materialization.
 * This read-only boundary does not mutate durable state and keeps secret recovery out of routes, catalog projections, and lifecycle orchestration.
 */
export async function pluginInstallationGetRuntimeConfiguration(
    executor: DrizzleExecutor,
    secretProtector: PluginSecretProtector,
    installationId: string,
): Promise<PluginRuntimeConfiguration> {
    const [row] = await executor
        .select({
            id: pluginInstallations.id,
            pluginId: plugins.id,
            shortName: plugins.shortName,
            manifestJson: plugins.manifestJson,
            packageDigest: plugins.packageDigest,
            packageDirectory: plugins.packageDirectory,
            containerName: pluginInstallations.containerName,
            containerInstanceId: pluginInstallations.containerInstanceId,
            grantedPermissionsJson: pluginInstallations.grantedPermissionsJson,
            containerImageId: pluginInstallations.containerImageId,
            selectedImageTag: agentImages.dockerTag,
            selectedImageStatus: agentImages.status,
        })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
        .leftJoin(agentImages, eq(agentImages.id, pluginInstallations.containerImageId))
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin installation was not found");
    const manifest = installedManifest(row.manifestJson);
    const installedPackage = {
        installationId: row.id,
        pluginId: row.pluginId,
        shortName: row.shortName,
        packageDirectory: row.packageDirectory,
        packageDigest: row.packageDigest,
    };
    if (!manifest.container && !manifest.mcp) return { ...installedPackage, type: "skills_only" };
    const variableRows = await executor
        .select({
            key: pluginInstallationVariables.key,
            kind: pluginInstallationVariables.kind,
            textValue: pluginInstallationVariables.textValue,
            secretCiphertext: pluginInstallationVariables.secretCiphertext,
        })
        .from(pluginInstallationVariables)
        .where(eq(pluginInstallationVariables.installationId, installationId));
    const environment: Record<string, string> = {};
    for (const definition of manifest.variables) {
        const variable = variableRows.find(({ key }) => key === definition.key);
        if (!variable || variable.kind !== definition.kind)
            throw new PluginError(
                "broken_configuration",
                `Plugin variable ${definition.key} is missing or has the wrong kind`,
            );
        if (definition.kind === "secret") {
            if (!variable.secretCiphertext)
                throw new PluginError(
                    "broken_configuration",
                    `Plugin secret ${definition.key} is missing`,
                );
            try {
                environment[definition.key] = await secretProtector.reveal(
                    variable.secretCiphertext,
                    { installationId, key: definition.key },
                );
            } catch {
                throw new PluginError(
                    "broken_configuration",
                    `Plugin secret ${definition.key} cannot be decrypted`,
                );
            }
        } else {
            if (!variable.textValue)
                throw new PluginError(
                    "broken_configuration",
                    `Plugin variable ${definition.key} is missing`,
                );
            environment[definition.key] = variable.textValue;
        }
    }
    if (manifest.mcp?.type === "remote") {
        const headers = Object.fromEntries(
            Object.entries(manifest.mcp.headers).map(([key, template]) => [
                key,
                template.replace(/\$\{([^}]+)\}/g, (_match, variable: string) => {
                    const value = environment[variable];
                    if (value === undefined)
                        throw new PluginError(
                            "broken_configuration",
                            `Remote MCP header references missing variable ${variable}`,
                        );
                    return value;
                }),
            ]),
        );
        if (Object.values(headers).some((value) => /\r|\n/.test(value)))
            throw new PluginError(
                "broken_configuration",
                "Resolved remote MCP headers may not contain newlines",
            );
        return {
            ...installedPackage,
            type: "remote",
            url: manifest.mcp.url,
            headers,
        };
    }
    const localContainer = effectiveContainer(manifest);
    if (!localContainer)
        throw new PluginError("broken_configuration", "Plugin container definition is missing");
    if (!row.containerName)
        throw new PluginError("broken_configuration", "Plugin container name is missing");
    let imageTag: string;
    if (localContainer.dockerfile) {
        imageTag = `happy2-plugin:${row.packageDigest.replace(/^sha256:/, "")}`;
    } else {
        if (!row.containerImageId || !row.selectedImageTag || row.selectedImageStatus !== "ready")
            throw new PluginError(
                "broken_configuration",
                "Selected plugin container image is missing or not ready",
            );
        imageTag = row.selectedImageTag;
    }
    return {
        ...installedPackage,
        type: "local",
        ...(localContainer.command
            ? { command: { command: localContainer.command, args: localContainer.args } }
            : {}),
        ...(manifest.mcp?.type === "stdio"
            ? { mcp: { command: manifest.mcp.command, args: manifest.mcp.args } }
            : {}),
        environment,
        containerName: row.containerName,
        containerInstanceId: row.containerInstanceId ?? undefined,
        imageTag,
        ...(localContainer.dockerfile ? { bundledDockerfile: localContainer.dockerfile } : {}),
        permissions: pluginPermissionsValidate(
            pluginPermissionsParse(row.grantedPermissionsJson),
            localContainer.permissions,
        ),
    };
}
