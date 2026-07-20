import type {
    BuiltPluginManifest,
    PluginVariableDefinition,
    UiAssetDeclaration,
} from "../types.js";
import type { PluginManifestBuildConfig } from "./config.js";

const SHORT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function createPluginManifest(
    source: PluginManifestBuildConfig,
    uiAssets: readonly UiAssetDeclaration[],
): BuiltPluginManifest {
    required(source.displayName, "displayName", 100);
    required(source.description, "description", 1_000);
    if (!SHORT_NAME.test(source.shortName)) throw new TypeError("shortName is invalid");
    if (!SEMVER.test(source.version)) throw new TypeError("version must be valid SemVer");
    const permissions = unique(source.permissions ?? [], "permission");
    const variables = source.variables ?? [];
    validateVariables(variables);
    return {
        schemaVersion: 1,
        version: source.version,
        displayName: source.displayName,
        shortName: source.shortName,
        description: source.description,
        variables,
        uiAssets,
        container: {
            dockerfile: "container/Dockerfile",
            permissions,
        },
        mcp: { type: "stdio", command: "node", args: ["/plugin/server.js"] },
    };
}

export function validateVariables(variables: readonly PluginVariableDefinition[]): void {
    if (variables.length > 64) throw new TypeError("At most 64 plugin variables are allowed");
    unique(
        variables.map(({ key }) => key),
        "variable key",
    );
    for (const variable of variables) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(variable.key))
            throw new TypeError(`Variable key ${JSON.stringify(variable.key)} is invalid`);
        required(variable.displayName, `${variable.key}.displayName`, 100);
        required(variable.description, `${variable.key}.description`, 1_000);
        if (variable.kind !== "secret" && variable.kind !== "text")
            throw new TypeError(`${variable.key}.kind is invalid`);
    }
}

function unique<const T extends string>(values: readonly T[], label: string): readonly T[] {
    const result = new Set<T>();
    for (const value of values) {
        required(value, label, 100);
        if (result.has(value)) throw new TypeError(`Duplicate ${label} ${JSON.stringify(value)}`);
        result.add(value);
    }
    return [...result];
}

function required(value: string, label: string, maximum: number): void {
    if (typeof value !== "string" || !value.trim() || value.length > maximum)
        throw new TypeError(`${label} must contain 1-${maximum} characters`);
}
