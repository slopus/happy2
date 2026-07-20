export { normalizeUiAsset, packageFile, type NormalizedUiAsset } from "./assets.js";
export { buildPlugin, inlineViteHtml, type PluginBuildResult } from "./build.js";
export {
    definePluginConfig,
    loadPluginConfig,
    type PluginAppBuildConfig,
    type PluginBuildConfig,
    type PluginManifestBuildConfig,
} from "./config.js";
export { createPluginManifest, validateVariables } from "./manifest.js";
export type {
    BuiltPluginManifest,
    PluginHostPermission,
    PluginVariableDefinition,
    UiAssetDeclaration,
} from "../types.js";
export { pluginHostPermissions } from "../types.js";
