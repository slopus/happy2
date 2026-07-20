import {
    assembleBuiltinPluginCatalog,
    assembledPluginCatalogDirectory,
    builtinPluginOutputs,
} from "./assemble.js";

await assembleBuiltinPluginCatalog(assembledPluginCatalogDirectory, builtinPluginOutputs);
console.log(`Assembled ${builtinPluginOutputs.length} built-in plugins.`);
