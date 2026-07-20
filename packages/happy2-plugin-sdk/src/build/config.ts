import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
    pluginHostPermissions,
    type PluginHostPermission,
    type PluginVariableDefinition,
} from "../types.js";

export interface PluginAppBuildConfig {
    readonly entry: string;
}

export interface PluginManifestBuildConfig {
    readonly description: string;
    readonly displayName: string;
    readonly permissions?: readonly PluginHostPermission[];
    readonly shortName: string;
    readonly variables?: readonly PluginVariableDefinition[];
    readonly version: string;
}

export interface PluginBuildConfig {
    readonly apps?: Readonly<Record<string, PluginAppBuildConfig | string>>;
    readonly manifest: PluginManifestBuildConfig;
    readonly outDir?: string;
    readonly pluginIcon?: string;
    readonly root?: string;
    readonly server?: string;
    readonly serverMinify?: boolean;
    readonly uiAssets?: Readonly<Record<string, string>>;
}

/** Identity helper that preserves literal app, asset, and manifest types. */
export function definePluginConfig<const T extends PluginBuildConfig>(config: T): T {
    return config;
}

export async function loadPluginConfig(root = process.cwd()): Promise<PluginBuildConfig> {
    const packageRoot = resolve(root);
    for (const name of [
        "happy2.plugin.ts",
        "happy2.plugin.mts",
        "happy2.plugin.js",
        "happy2.plugin.mjs",
    ]) {
        const path = resolve(packageRoot, name);
        if (!(await exists(path))) continue;
        const imported = (await import(`${pathToFileURL(path).href}?t=${Date.now()}`)) as {
            default?: unknown;
        };
        return config(imported.default, path);
    }
    return inferPluginConfig(packageRoot);
}

async function inferPluginConfig(root: string): Promise<PluginBuildConfig> {
    const source = await readFile(resolve(root, "plugin.json"), "utf8").catch(() => {
        throw new Error(
            "No happy2.plugin.ts or plugin.json found; add either one to the plugin package root",
        );
    });
    let manifest: unknown;
    try {
        manifest = JSON.parse(source);
    } catch {
        throw new Error("plugin.json must contain valid JSON");
    }
    const record = object(manifest, "plugin.json");
    const apps: Record<string, string> = {};
    const appsDirectory = resolve(root, "src/apps");
    if (await exists(appsDirectory))
        for (const entry of await readdir(appsDirectory, { withFileTypes: true })) {
            if (!entry.isFile() || !/\.(?:tsx|ts|jsx|js)$/.test(entry.name)) continue;
            const name = entry.name.replace(/\.(?:tsx|ts|jsx|js)$/, "");
            apps[name] = `src/apps/${entry.name}`;
        }
    const uiAssets: Record<string, string> = {};
    if (record.uiAssets !== undefined) {
        if (!Array.isArray(record.uiAssets))
            throw new Error("plugin.json uiAssets must be an array");
        for (const [index, value] of record.uiAssets.entries()) {
            const asset = object(value, `plugin.json uiAssets[${index}]`);
            uiAssets[string(asset.id, `uiAssets[${index}].id`)] = string(
                asset.path,
                `uiAssets[${index}].path`,
            );
        }
    }
    return {
        apps,
        manifest: {
            description: string(record.description, "description"),
            displayName: string(record.displayName, "displayName"),
            permissions: permissions(record),
            shortName: string(record.shortName, "shortName"),
            variables: variables(record),
            version: string(record.version, "version"),
        },
        pluginIcon: (await exists(resolve(root, "plugin.png"))) ? "plugin.png" : undefined,
        root,
        server: "src/server.ts",
        uiAssets,
    };
}

function config(value: unknown, path: string): PluginBuildConfig {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${path} must default-export a plugin build config object`);
    return value as PluginBuildConfig;
}

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${label} must be an object`);
    return value as Readonly<Record<string, unknown>>;
}

function permissions(manifest: Readonly<Record<string, unknown>>): readonly PluginHostPermission[] {
    if (manifest.container === undefined) return [];
    const container = object(manifest.container, "container");
    if (container.permissions === undefined) return [];
    if (
        !Array.isArray(container.permissions) ||
        container.permissions.some(
            (item) =>
                typeof item !== "string" ||
                !pluginHostPermissions.includes(item as PluginHostPermission),
        )
    )
        throw new TypeError("container.permissions must be an array of strings");
    return container.permissions as PluginHostPermission[];
}

function variables(
    manifest: Readonly<Record<string, unknown>>,
): readonly PluginVariableDefinition[] {
    if (manifest.variables === undefined) return [];
    if (!Array.isArray(manifest.variables)) throw new TypeError("variables must be an array");
    return manifest.variables as PluginVariableDefinition[];
}

function string(value: unknown, label: string): string {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
    return value;
}

async function exists(path: string): Promise<boolean> {
    return access(path).then(
        () => true,
        () => false,
    );
}
