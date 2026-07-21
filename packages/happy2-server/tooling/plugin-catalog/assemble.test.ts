import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pluginCatalogLoad } from "../../sources/modules/plugin/catalog.js";
import {
    assembleBuiltinPluginCatalog,
    builtinPluginOutputsLoad,
    type BuiltinPluginOutput,
} from "./assemble.js";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { force: true, recursive: true })),
    );
});

describe("built-in plugin catalog assembly", () => {
    it("copies only the explicit validated outputs and removes stale catalog entries", async () => {
        const root = await temporaryDirectory();
        const target = join(root, "server", "dist", "plugins");
        await mkdir(join(target, "stale"), { recursive: true });
        await writeFile(join(target, "stale", "marker"), "stale");
        const hello = await pluginOutput(root, "happy2-plugin-hello", "hello");
        const todos = await pluginOutput(root, "happy2-plugin-todos", "todos");

        await assembleBuiltinPluginCatalog(target, [hello, todos]);

        expect(
            (await pluginCatalogLoad(target)).list().map(({ manifest }) => manifest.shortName),
        ).toEqual(["hello", "todos"]);
        await expect(readFile(join(target, "stale", "marker"))).rejects.toMatchObject({
            code: "ENOENT",
        });
        expect(await readFile(join(target, "hello", "server.js"), "utf8")).toBe("export {};\n");
    });

    it("preserves the last good catalog when a new output fails package validation", async () => {
        const root = await temporaryDirectory();
        const target = join(root, "server", "dist", "plugins");
        const hello = await pluginOutput(root, "happy2-plugin-hello", "hello");
        await assembleBuiltinPluginCatalog(target, [hello]);
        await writeFile(join(hello.directory, "plugin.json"), "{}");

        await expect(assembleBuiltinPluginCatalog(target, [hello])).rejects.toThrow(
            "schemaVersion must be 1",
        );

        expect((await pluginCatalogLoad(target)).get("hello")?.manifest.shortName).toBe("hello");
    });

    it("rejects duplicate allowlist package names and short names before copying", async () => {
        const root = await temporaryDirectory();
        const output = await pluginOutput(root, "happy2-plugin-hello", "hello");
        await expect(
            assembleBuiltinPluginCatalog(join(root, "target-one"), [output, output]),
        ).rejects.toThrow("Duplicate built-in plugin package");
        await expect(
            assembleBuiltinPluginCatalog(join(root, "target-two"), [
                output,
                { ...output, packageName: "happy2-plugin-another" },
            ]),
        ).rejects.toThrow("Duplicate built-in plugin shortName");
    });
});

describe("built-in plugin discovery", () => {
    it("discovers every plugin workspace with a source manifest", async () => {
        const root = await temporaryDirectory();
        const packagesDirectory = join(root, "packages");
        await Promise.all([
            pluginWorkspace(packagesDirectory, "happy2-plugin-zebra", true),
            pluginWorkspace(packagesDirectory, "happy2-plugin-alpha", true),
            pluginWorkspace(packagesDirectory, "happy2-plugin-sdk", false),
            pluginWorkspace(packagesDirectory, "unrelated-package", true),
        ]);

        await expect(builtinPluginOutputsLoad(packagesDirectory)).resolves.toEqual([
            {
                packageName: "happy2-plugin-alpha",
                shortName: "alpha",
                directory: join(packagesDirectory, "happy2-plugin-alpha", "dist", "plugin"),
            },
            {
                packageName: "happy2-plugin-zebra",
                shortName: "zebra",
                directory: join(packagesDirectory, "happy2-plugin-zebra", "dist", "plugin"),
            },
        ]);
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-plugin-assembly-"));
    temporaryDirectories.push(directory);
    return directory;
}

async function pluginOutput(
    root: string,
    packageName: string,
    shortName: string,
): Promise<BuiltinPluginOutput> {
    const directory = join(root, "packages", packageName, "dist", "plugin");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(join(directory, "server.js"), "export {};\n");
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: shortName,
            shortName,
            description: `${shortName} test plugin`,
            variables: [],
            mcp: { type: "stdio", command: "node", args: ["/plugin/server.js"] },
        }),
    );
    return { packageName, shortName, directory };
}

async function pluginWorkspace(
    packagesDirectory: string,
    packageName: string,
    plugin: boolean,
): Promise<void> {
    const directory = join(packagesDirectory, packageName);
    await mkdir(directory, { recursive: true });
    if (plugin) await writeFile(join(directory, "happy2.plugin.ts"), "export default {};\n");
}
