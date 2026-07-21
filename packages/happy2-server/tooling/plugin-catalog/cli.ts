import {
    assembleBuiltinPluginCatalog,
    assembledPluginCatalogDirectory,
    builtinPluginOutputsLoad,
} from "./assemble.js";

const builtinPluginOutputs = await builtinPluginOutputsLoad();
await assembleBuiltinPluginCatalog(assembledPluginCatalogDirectory, builtinPluginOutputs);
console.log(`Assembled ${builtinPluginOutputs.length} built-in plugins.`);
