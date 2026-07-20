import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
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
    it("loads only declared normalized monochrome UI action assets", async () => {
        const root = await temporaryDirectory();
        const plugin = await packageDirectory(root, "ui-assets");
        await mkdir(join(plugin, "assets"));
        await actionAssetWrite(join(plugin, "assets", "check.png"));
        await manifest(plugin, {
            variables: [],
            mcp: stdioMcp(),
            uiAssets: [{ id: "check", path: "assets/check.png" }],
        });

        await expect(pluginPackageLoad(plugin)).resolves.toMatchObject({
            manifest: { uiAssets: [{ id: "check", path: "assets/check.png" }] },
            uiAssets: [
                {
                    id: "check",
                    path: "assets/check.png",
                    contentType: "image/png",
                    width: 40,
                    height: 40,
                    checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
                },
            ],
        });

        const invalidRoot = await temporaryDirectory();
        const invalid = await packageDirectory(invalidRoot, "invalid-ui-assets");
        await mkdir(join(invalid, "assets"));
        await actionAssetWrite(join(invalid, "assets", "white.png"), { visibleRgb: 255 });
        await manifest(invalid, {
            variables: [],
            mcp: stdioMcp(),
            uiAssets: [{ id: "white", path: "assets/white.png" }],
        });
        await expect(pluginPackageLoad(invalid)).rejects.toThrow(
            "UI asset white visible pixels must be normalized black",
        );

        const grayscaleRoot = await temporaryDirectory();
        const grayscale = await packageDirectory(grayscaleRoot, "grayscale-ui-assets");
        await mkdir(join(grayscale, "assets"));
        await grayscaleActionAssetWrite(join(grayscale, "assets", "grayscale.png"));
        await manifest(grayscale, {
            variables: [],
            mcp: stdioMcp(),
            uiAssets: [{ id: "grayscale", path: "assets/grayscale.png" }],
        });
        await expect(pluginPackageLoad(grayscale)).rejects.toThrow(
            "UI asset grayscale must be a 40x40 RGBA PNG",
        );
    });

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
            store.readSkill(
                "cmockplugin",
                snapshot,
                "search-tools",
                loaded.packageDigest,
                "project-search",
                "skills/project-search",
            ),
        ).resolves.toEqual({
            description: "Search the current project and its documentation.",
            source: "---\nname: project-search\ndescription: Search the current project and its documentation.\n---\n\nSearch carefully.\n",
        });
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

    it("loads container-only commands and rejects unrecognized host capabilities", async () => {
        const root = await temporaryDirectory();
        const command = await packageDirectory(root, "command-runtime");
        await mkdir(join(command, "container"));
        await writeFile(join(command, "container", "Dockerfile"), "FROM scratch\n");
        await manifest(command, {
            variables: [variable("COMMAND_TOKEN")],
            container: {
                dockerfile: "container/Dockerfile",
                command: "/plugin/worker",
                args: ["--serve"],
                permissions: [
                    "channels:create",
                    "chats:members:add",
                    "chats:members:remove",
                    "chats:update",
                    "plugins:list",
                ],
            },
        });
        await expect(pluginCatalogLoad(root)).resolves.toMatchObject({});
        expect((await pluginCatalogLoad(root)).get("command-runtime")?.manifest.container).toEqual({
            dockerfile: "container/Dockerfile",
            command: "/plugin/worker",
            args: ["--serve"],
            permissions: [
                "channels:create",
                "chats:members:add",
                "chats:members:remove",
                "chats:update",
                "plugins:list",
            ],
        });

        const deniedRoot = await temporaryDirectory();
        const denied = await packageDirectory(deniedRoot, "denied-runtime");
        await manifest(denied, {
            variables: [],
            container: {
                command: "/plugin/worker",
                args: [],
                permissions: ["users:list"],
            },
        });
        await expect(pluginCatalogLoad(deniedRoot)).rejects.toThrow(
            "unknown container permission users:list",
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
        container?: Record<string, unknown>;
        mcp?: Record<string, unknown>;
        uiAssets?: unknown[];
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

async function actionAssetWrite(
    path: string,
    options: { visibleRgb?: number } = {},
): Promise<void> {
    const pixels = Buffer.alloc(40 * 40 * 4);
    const visibleRgb = options.visibleRgb ?? 0;
    for (let y = 10; y < 30; y += 1)
        for (let x = 10; x < 30; x += 1) {
            const offset = (y * 40 + x) * 4;
            pixels[offset] = visibleRgb;
            pixels[offset + 1] = visibleRgb;
            pixels[offset + 2] = visibleRgb;
            pixels[offset + 3] = x === 10 || y === 10 ? 128 : 255;
        }
    await sharp(pixels, { raw: { width: 40, height: 40, channels: 4 } })
        .png()
        .toFile(path);
}

async function grayscaleActionAssetWrite(path: string): Promise<void> {
    const scanlines = Buffer.alloc(40 * (1 + 40 * 2));
    for (let y = 0; y < 40; y += 1)
        for (let x = 0; x < 40; x += 1) {
            const offset = y * 81 + 1 + x * 2;
            scanlines[offset + 1] = x >= 10 && x < 30 && y >= 10 && y < 30 ? 255 : 0;
        }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(40, 0);
    header.writeUInt32BE(40, 4);
    header[8] = 8;
    header[9] = 4;
    await writeFile(
        path,
        Buffer.concat([
            Buffer.from("89504e470d0a1a0a", "hex"),
            pngChunk("IHDR", header),
            pngChunk("IDAT", deflateSync(scanlines)),
            pngChunk("IEND", Buffer.alloc(0)),
        ]),
    );
}

function pngChunk(type: string, data: Buffer): Buffer {
    const name = Buffer.from(type, "ascii");
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    name.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
    return chunk;
}

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
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
