import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { builtinPluginCatalogDirectory } from "./builtinCatalog.js";

describe("built-in plugin catalog path", () => {
    it("uses the same assembled catalog from source and compiled server entrypoints", () => {
        const packageRoot = join("/workspace", "packages", "happy2-server");
        expect(
            builtinPluginCatalogDirectory(
                pathToFileURL(join(packageRoot, "sources", "server.ts")).href,
            ),
        ).toBe(join(packageRoot, "dist", "plugins"));
        expect(
            builtinPluginCatalogDirectory(
                pathToFileURL(join(packageRoot, "dist", "server.js")).href,
            ),
        ).toBe(join(packageRoot, "dist", "plugins"));
    });

    it("rejects an entrypoint outside a server source or distribution tree", () => {
        expect(() =>
            builtinPluginCatalogDirectory(pathToFileURL("/workspace/server.js").href),
        ).toThrow("Built-in plugin catalog cannot be resolved");
    });
});
