import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pluginCatalogLoad, pluginPackageLoad } from "./catalog.js";
import { PluginPackageStore } from "./packageStore.js";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);
const directories: string[] = [];

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    );
});

describe("plugin package catalog", () => {
    it("loads a spec-shaped skill and verifies an immutable installed snapshot", async () => {
        const root = await temporaryDirectory();
        const plugin = await packageDirectory(root, "search-tools");
        await mkdir(join(plugin, "skills", "project-search", "references"), { recursive: true });
        await writeFile(
            join(plugin, "skills", "project-search", "SKILL.md"),
            "---\nname: project-search\ndescription: Search the current project and its documentation.\n---\n\nSearch carefully.\n",
        );
        await writeFile(
            join(plugin, "skills", "project-search", "references", "syntax.md"),
            "# Syntax\n",
        );
        await manifest(plugin, { variables: [], version: "1.0.0+unit.1" });

        const catalog = await pluginCatalogLoad(root);
        const loaded = catalog.get("search-tools")!;
        expect(loaded.skills).toEqual([
            {
                name: "project-search",
                description: "Search the current project and its documentation.",
                directory: "skills/project-search",
            },
        ]);
        expect(loaded.packageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(loaded.image).toMatchObject({
            contentType: "image/png",
            width: 1,
            height: 1,
            size: SQUARE_PNG.byteLength,
            thumbhash: expect.any(String),
            checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        });

        const installedRoot = await temporaryDirectory();
        const store = new PluginPackageStore(installedRoot);
        const installed = await store.install(loaded, "cmockplugin");
        const snapshot = installed.packageDirectory;
        expect(snapshot).toBe(join(await realpath(installedRoot), "cmockplugin"));
        expect(installed.imageStorageKey).toBe("cmockplugin/plugin.png");
        const copied = await pluginPackageLoad(snapshot, "search-tools");
        expect(copied.packageDigest).toBe(loaded.packageDigest);
        const copiedManifest = JSON.parse(await readFile(join(snapshot, "plugin.json"), "utf8"));
        expect(copiedManifest.shortName).toBe("search-tools");
        await expect(
            store.verify("cmockplugin", snapshot, "search-tools", loaded.packageDigest),
        ).resolves.toBeUndefined();
        await expect(
            store.readImage(
                "cmockplugin",
                snapshot,
                installed.imageStorageKey,
                "search-tools",
                loaded.packageDigest,
            ),
        ).resolves.toEqual(SQUARE_PNG);
        await expect(store.install(loaded, "cmockplugin")).resolves.toEqual(installed);
        await writeFile(join(snapshot, "unexpected.txt"), "tampered");
        await expect(store.install(loaded, "cmockplugin")).rejects.toThrow(
            "no longer matches its recorded digest",
        );
        await expect(
            store.verify("cmockplugin", snapshot, "search-tools", loaded.packageDigest),
        ).rejects.toThrow("no longer matches its recorded digest");
        await rm(snapshot, { force: true, recursive: true });
        await symlink(loaded.directory, snapshot);
        await expect(
            store.verify("cmockplugin", snapshot, "search-tools", loaded.packageDigest),
        ).rejects.toThrow("outside the plugin package store");
    });

    it("rejects skill directories without SKILL.md, undeclared header variables, and symlinks", async () => {
        const missingSkillRoot = await temporaryDirectory();
        const missingSkill = await packageDirectory(missingSkillRoot, "missing-skill");
        await mkdir(join(missingSkill, "skills", "orphan", "references"), { recursive: true });
        await writeFile(join(missingSkill, "skills", "orphan", "references", "notes.md"), "x");
        await manifest(missingSkill, { variables: [] });
        await expect(pluginCatalogLoad(missingSkillRoot)).rejects.toThrow(
            "skills/orphan/SKILL.md is required",
        );

        const headerRoot = await temporaryDirectory();
        const header = await packageDirectory(headerRoot, "bad-header");
        await manifest(header, {
            variables: [],
            mcp: {
                type: "remote",
                url: "https://mcp.example.com/mcp",
                headers: { authorization: "Bearer ${UNDECLARED}" },
            },
        });
        await expect(pluginCatalogLoad(headerRoot)).rejects.toThrow(
            "references undeclared variable UNDECLARED",
        );

        const unusedVariableRoot = await temporaryDirectory();
        const unusedVariable = await packageDirectory(unusedVariableRoot, "unused-variable");
        await manifest(unusedVariable, {
            variables: [variable("REMOTE_TOKEN")],
            mcp: {
                type: "remote",
                url: "https://mcp.example.com/mcp",
                headers: { authorization: "Static value" },
            },
        });
        await expect(pluginCatalogLoad(unusedVariableRoot)).rejects.toThrow(
            "remote MCP variable REMOTE_TOKEN is not used",
        );

        const privateRemoteRoot = await temporaryDirectory();
        const privateRemote = await packageDirectory(privateRemoteRoot, "private-remote");
        await manifest(privateRemote, {
            variables: [],
            mcp: { type: "remote", url: "https://localhost/mcp", headers: {} },
        });
        await expect(pluginCatalogLoad(privateRemoteRoot)).rejects.toThrow(
            "hostname is not public",
        );

        const symlinkRoot = await temporaryDirectory();
        const linked = await packageDirectory(symlinkRoot, "linked-package");
        await writeFile(join(symlinkRoot, "outside.txt"), "outside");
        await symlink(join(symlinkRoot, "outside.txt"), join(linked, "linked.txt"));
        await manifest(linked, { variables: [], mcp: stdioMcp() });
        await expect(pluginCatalogLoad(symlinkRoot)).rejects.toThrow(
            "Plugin packages may not contain symlinks",
        );

        const versionRoot = await temporaryDirectory();
        const versioned = await packageDirectory(versionRoot, "bad-version");
        await manifest(versioned, { variables: [], version: "1.0.0-01", mcp: stdioMcp() });
        await expect(pluginCatalogLoad(versionRoot)).rejects.toThrow(
            "version must be a valid SemVer version",
        );
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-plugin-unit-"));
    directories.push(directory);
    return directory;
}

async function packageDirectory(root: string, shortName: string): Promise<string> {
    const directory = join(root, shortName);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    return directory;
}

async function manifest(
    directory: string,
    additions: {
        variables: unknown[];
        version?: string;
        mcp?: Record<string, unknown>;
    },
): Promise<void> {
    const shortName = basename(directory);
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: shortName,
            shortName,
            description: `Plugin package ${shortName}.`,
            ...additions,
        }),
    );
}

function stdioMcp(): Record<string, unknown> {
    return { type: "stdio", command: "server", args: [] };
}

function variable(key: string): Record<string, unknown> {
    return {
        key,
        displayName: key,
        description: `Configuration for ${key}.`,
        kind: "secret",
    };
}
