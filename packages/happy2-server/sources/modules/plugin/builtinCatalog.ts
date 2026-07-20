import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

/** Resolves the assembled built-in plugin catalog for source and compiled server entrypoints. */
export function builtinPluginCatalogDirectory(moduleUrl: string): string {
    const moduleDirectory = dirname(fileURLToPath(moduleUrl));
    const tree = basename(moduleDirectory);
    if (tree !== "sources" && tree !== "dist")
        throw new Error(`Built-in plugin catalog cannot be resolved from ${moduleDirectory}`);
    return join(dirname(moduleDirectory), "dist", "plugins");
}
