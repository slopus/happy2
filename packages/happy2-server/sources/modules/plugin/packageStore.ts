import { createHash, randomUUID } from "node:crypto";
import {
    cp,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    realpath,
    rename,
    rm,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pluginArchiveExtract } from "./archive.js";
import { pluginPackageLoadInstalled, pluginPackageLoadSource } from "./catalog.js";
import type { PluginPackage, PluginSource } from "./types.js";
import type { PluginReadySkillPackage } from "./pluginSkillPackageListReady.js";
import type { PluginUiAssetSummary } from "./pluginUiAssetGet.js";

export interface PreparedPluginPackage {
    plugin: PluginPackage;
    cleanup(): Promise<void>;
}

export interface InstalledPluginUpdatePackage {
    created: boolean;
    imageStorageKey: string;
    packageDirectory: string;
}

/** Persists one exact package snapshot per system plugin so catalog changes cannot mutate installed metadata or files. */
export class PluginPackageStore {
    constructor(private readonly root: string) {}

    async install(
        plugin: PluginPackage,
        pluginId: string,
    ): Promise<{ packageDirectory: string; imageStorageKey: string }> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const destination = this.path(pluginId);
        const staging = resolve(this.root, `.${pluginId}.staging-${randomUUID()}`);
        await rm(staging, { force: true, recursive: true });
        try {
            await cp(plugin.directory, staging, {
                recursive: true,
                errorOnExist: true,
                force: false,
            });
            const copied = await pluginPackageLoadSource(staging, plugin.source);
            if (copied.packageDigest !== plugin.packageDigest)
                throw new Error("Plugin package changed while its system snapshot was copied");
            await mkdir(join(staging, "data"), { recursive: true, mode: 0o700 });
            if (await pathExists(destination)) {
                await this.verify(
                    pluginId,
                    destination,
                    plugin.manifest.shortName,
                    plugin.packageDigest,
                );
            } else {
                try {
                    await rename(staging, destination);
                } catch (publishError) {
                    if (!(await pathExists(destination))) throw publishError;
                    await this.verify(
                        pluginId,
                        destination,
                        plugin.manifest.shortName,
                        plugin.packageDigest,
                    );
                }
            }
            return {
                packageDirectory: await realpath(destination),
                imageStorageKey: `${pluginId}/plugin.png`,
            };
        } finally {
            await rm(staging, { force: true, recursive: true });
        }
    }

    async installUpdate(
        plugin: PluginPackage,
        pluginId: string,
    ): Promise<InstalledPluginUpdatePackage> {
        const destination = this.updatePath(pluginId, plugin.packageDigest, randomUUID());
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        const staging = resolve(this.root, `.update-${pluginId}-${randomUUID()}`);
        try {
            await cp(plugin.directory, staging, {
                recursive: true,
                errorOnExist: true,
                force: false,
            });
            const copied = await pluginPackageLoadSource(staging, plugin.source);
            if (copied.packageDigest !== plugin.packageDigest)
                throw new Error("Plugin package changed while its update snapshot was copied");
            await rename(staging, destination);
            return {
                created: true,
                packageDirectory: await realpath(destination),
                imageStorageKey: `${pluginId}/plugin.png`,
            };
        } finally {
            await rm(staging, { force: true, recursive: true });
        }
    }

    async prepareArchive(archive: Buffer, source: PluginSource): Promise<PreparedPluginPackage> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const temporary = resolve(this.root, `.incoming-${randomUUID()}`);
        try {
            const [candidate] = await pluginArchiveExtract(archive, temporary, "zip");
            if (!candidate) throw new Error("Plugin ZIP does not contain a package");
            const loaded = await pluginPackageLoadSource(candidate.directory, source);
            const plugin =
                source.kind === "archive"
                    ? {
                          ...loaded,
                          source: { kind: "archive" as const, reference: loaded.packageDigest },
                      }
                    : loaded;
            return {
                plugin,
                cleanup: () => rm(temporary, { force: true, recursive: true }),
            };
        } catch (error) {
            await rm(temporary, { force: true, recursive: true });
            throw error;
        }
    }

    async stageRequest(plugin: PluginPackage, requestId: string): Promise<string> {
        const destination = this.requestPath(requestId);
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        await rm(destination, { force: true, recursive: true });
        await cp(plugin.directory, destination, {
            recursive: true,
            errorOnExist: true,
            force: false,
        });
        const copied = await pluginPackageLoadSource(destination, plugin.source);
        if (copied.packageDigest !== plugin.packageDigest) {
            await rm(destination, { force: true, recursive: true });
            throw new Error("Plugin package changed while its approval snapshot was copied");
        }
        return realpath(destination);
    }

    async loadRequest(
        requestId: string,
        recordedDirectory: string,
        source: PluginSource,
        packageDigest: string,
    ): Promise<PluginPackage> {
        const destination = this.requestPath(requestId);
        const [requestRoot, actual, recorded] = await Promise.all([
            realpath(resolve(this.root, ".requests")),
            realpath(destination),
            realpath(recordedDirectory),
        ]);
        const expected = resolve(requestRoot, requestId);
        if (actual !== expected || recorded !== expected)
            throw new Error("Pending plugin package is outside the request package store");
        const plugin = await pluginPackageLoadSource(actual, source);
        if (plugin.packageDigest !== packageDigest)
            throw new Error("Pending plugin package no longer matches its recorded digest");
        return plugin;
    }

    async loadInstalled(
        pluginId: string,
        recordedDirectory: string,
        shortName: string,
        packageDigest: string,
        source: PluginSource,
    ): Promise<PluginPackage> {
        await this.verify(pluginId, recordedDirectory, shortName, packageDigest);
        return pluginPackageLoadInstalled(recordedDirectory, source, shortName);
    }

    async readRequestImage(
        requestId: string,
        recordedDirectory: string,
        source: PluginSource,
        packageDigest: string,
    ): Promise<Buffer> {
        const plugin = await this.loadRequest(requestId, recordedDirectory, source, packageDigest);
        return readFile(plugin.iconPath);
    }

    async removeRequest(requestId: string): Promise<void> {
        await rm(this.requestPath(requestId), { force: true, recursive: true });
    }

    async syncSkills(
        installed: readonly PluginReadySkillPackage[],
        agentHome: string,
    ): Promise<void> {
        const targetRoot = resolve(agentHome, ".agents", "skills", "happy2-plugins");
        const staging = resolve(agentHome, ".agents", `.happy2-skills-${randomUUID()}`);
        await rm(staging, { force: true, recursive: true });
        await mkdir(staging, { recursive: true, mode: 0o700 });
        const desired = new Set<string>();
        try {
            for (const item of installed) {
                const plugin = await this.loadInstalled(
                    item.pluginId,
                    item.packageDirectory,
                    item.shortName,
                    item.packageDigest,
                    item.source,
                );
                for (const skill of plugin.skills) {
                    const directory = `${item.pluginId}-${skill.name}`;
                    desired.add(directory);
                    await cp(join(plugin.directory, skill.directory), join(staging, directory), {
                        recursive: true,
                        errorOnExist: true,
                        force: false,
                    });
                }
            }
            await mkdir(targetRoot, { recursive: true, mode: 0o700 });
            for (const entry of await readdir(targetRoot, { withFileTypes: true })) {
                if (desired.has(entry.name)) continue;
                await rm(join(targetRoot, entry.name), { force: true, recursive: true });
            }
            for (const directory of [...desired].sort()) {
                const destination = join(targetRoot, directory);
                await rm(destination, { force: true, recursive: true });
                await rename(join(staging, directory), destination);
            }
        } finally {
            await rm(staging, { force: true, recursive: true });
        }
    }

    async remove(pluginId: string): Promise<void> {
        await Promise.all([
            rm(this.path(pluginId), { force: true, recursive: true }),
            rm(resolve(this.root, ".packages", pluginId), { force: true, recursive: true }),
        ]);
    }

    async removeUpdate(pluginId: string, packageDirectory: string): Promise<void> {
        const legacy = this.path(pluginId);
        const target = resolve(packageDirectory);
        if (target === legacy) return;
        const updateRoot = resolve(this.root, ".packages", pluginId);
        if (!target.startsWith(`${updateRoot}${sep}`))
            throw new Error("Invalid plugin update package path");
        await rm(target, { force: true, recursive: true });
    }

    async cleanupTemporary(): Promise<void> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const entries = await readdir(this.root, { withFileTypes: true });
        await Promise.all(
            entries
                .filter(
                    (entry) =>
                        entry.name === ".prepared" ||
                        entry.name.startsWith(".download-") ||
                        entry.name.startsWith(".build-") ||
                        entry.name.startsWith(".update-"),
                )
                .map((entry) =>
                    rm(resolve(this.root, entry.name), { force: true, recursive: true }),
                ),
        );
    }

    async createDownloadDirectory(): Promise<string> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        return mkdtemp(join(resolve(this.root), ".download-"));
    }

    async removeDownloadDirectory(directory: string): Promise<void> {
        const root = resolve(this.root);
        const target = resolve(directory);
        if (!target.startsWith(`${root}${sep}.download-`))
            throw new Error("Invalid plugin download directory");
        await rm(target, { force: true, recursive: true });
    }

    async prepare(plugin: PluginPackage, preparationId: string): Promise<PluginPackage> {
        if (!/^[a-z0-9]+$/.test(preparationId)) throw new Error("Invalid plugin preparation id");
        const root = resolve(this.root, ".prepared");
        const destination = resolve(root, preparationId);
        if (!destination.startsWith(`${root}${sep}`)) throw new Error("Invalid preparation path");
        await mkdir(root, { recursive: true, mode: 0o700 });
        await cp(plugin.directory, destination, {
            recursive: true,
            errorOnExist: true,
            force: false,
        });
        const prepared = await pluginPackageLoadSource(destination, plugin.source);
        if (prepared.packageDigest !== plugin.packageDigest)
            throw new Error("Plugin package changed while it was prepared");
        return prepared;
    }

    async removePreparation(preparationId: string): Promise<void> {
        if (!/^[a-z0-9]+$/.test(preparationId)) throw new Error("Invalid plugin preparation id");
        await rm(resolve(this.root, ".prepared", preparationId), {
            force: true,
            recursive: true,
        });
    }

    async workspaceDirectory(pluginId: string, installationId: string): Promise<string> {
        if (!/^[a-z0-9]+$/.test(installationId)) throw new Error("Invalid plugin installation id");
        const directory = resolve(this.path(pluginId), "data", installationId);
        const dataRoot = resolve(this.path(pluginId), "data");
        if (!directory.startsWith(`${dataRoot}${sep}`)) throw new Error("Invalid plugin data path");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        return realpath(directory);
    }

    async createBuildContext(
        pluginId: string,
        recordedDirectory: string,
        shortName: string,
        packageDigest: string,
    ): Promise<string> {
        await this.verify(pluginId, recordedDirectory, shortName, packageDigest);
        const context = await mkdtemp(join(resolve(this.root), ".build-"));
        const dataDirectory = resolve(recordedDirectory, "data");
        try {
            await cp(recordedDirectory, context, {
                recursive: true,
                filter: (source) => resolve(source) !== dataDirectory,
            });
            const copied = await pluginPackageLoadSource(context, {
                kind: "builtin",
                reference: shortName,
            });
            if (copied.packageDigest !== packageDigest)
                throw new Error("Plugin build context does not match its installed package");
            return context;
        } catch (error) {
            await rm(context, { force: true, recursive: true });
            throw error;
        }
    }

    async removeBuildContext(directory: string): Promise<void> {
        const root = resolve(this.root);
        const target = resolve(directory);
        if (!target.startsWith(`${root}${sep}.build-`))
            throw new Error("Invalid plugin build context directory");
        await rm(target, { force: true, recursive: true });
    }

    async verify(
        pluginId: string,
        recordedDirectory: string,
        shortName: string,
        packageDigest: string,
    ): Promise<void> {
        await this.load(pluginId, recordedDirectory, shortName, packageDigest);
    }

    async readSkill(
        pluginId: string,
        recordedDirectory: string,
        shortName: string,
        packageDigest: string,
        skillName: string,
        skillDirectory: string,
        signal?: AbortSignal,
    ): Promise<{ description: string; source: string }> {
        signal?.throwIfAborted();
        const plugin = await this.load(pluginId, recordedDirectory, shortName, packageDigest);
        const skill = plugin.skills.find(({ name }) => name === skillName);
        if (!skill || skill.directory !== skillDirectory)
            throw new Error(`Installed plugin does not provide skill ${skillName}`);
        const source = await readFile(join(recordedDirectory, skill.directory, "SKILL.md"), {
            encoding: "utf8",
            signal,
        });
        return { description: skill.description, source };
    }

    async readImage(
        pluginId: string,
        recordedDirectory: string,
        imageStorageKey: string,
        shortName: string,
        packageDigest: string,
    ): Promise<Buffer> {
        await this.verify(pluginId, recordedDirectory, shortName, packageDigest);
        if (imageStorageKey !== `${pluginId}/plugin.png`)
            throw new Error("Installed plugin image storage key is invalid");
        return readFile(join(recordedDirectory, "plugin.png"));
    }

    async readUiAsset(asset: PluginUiAssetSummary): Promise<Buffer> {
        const plugin = await this.loadInstalled(
            asset.pluginId,
            asset.packageDirectory,
            asset.shortName,
            asset.packageDigest,
            { kind: asset.sourceKind, reference: asset.sourceReference },
        );
        if (
            plugin.source.kind !== asset.sourceKind ||
            plugin.source.reference !== asset.sourceReference
        )
            throw new Error("Installed plugin UI asset source identity changed");
        const declared = plugin.uiAssets.find(({ id }) => id === asset.assetId);
        if (
            !declared ||
            declared.path !== asset.relativePath ||
            declared.contentType !== asset.contentType ||
            declared.size !== asset.byteSize ||
            declared.width !== asset.width ||
            declared.height !== asset.height ||
            declared.checksumSha256 !== asset.checksumSha256
        )
            throw new Error("Installed plugin UI asset no longer matches its recorded metadata");
        const packageRoot = await realpath(asset.packageDirectory);
        const candidate = resolve(packageRoot, declared.path);
        if (!candidate.startsWith(`${packageRoot}${sep}`))
            throw new Error("Installed plugin UI asset is outside its package");
        const file = await lstat(candidate);
        if (!file.isFile() || file.isSymbolicLink())
            throw new Error("Installed plugin UI asset is not a regular package file");
        const actual = await realpath(candidate);
        if (!actual.startsWith(`${packageRoot}${sep}`))
            throw new Error("Installed plugin UI asset resolves outside its package");
        const body = await readFile(actual);
        if (
            body.byteLength !== asset.byteSize ||
            createHash("sha256").update(body).digest("hex") !== asset.checksumSha256
        )
            throw new Error("Installed plugin UI asset bytes changed after validation");
        return body;
    }

    private path(pluginId: string): string {
        if (!/^[a-z0-9]+$/.test(pluginId)) throw new Error("Invalid system plugin id");
        const destination = resolve(this.root, pluginId);
        const root = resolve(this.root);
        if (!destination.startsWith(`${root}${sep}`))
            throw new Error("Invalid plugin package path");
        return join(root, pluginId);
    }

    private async load(
        pluginId: string,
        recordedDirectory: string,
        shortName: string,
        packageDigest: string,
    ): Promise<PluginPackage> {
        const [canonicalRoot, actualDirectory] = await Promise.all([
            realpath(this.root),
            realpath(recordedDirectory),
        ]);
        const legacyDirectory = resolve(canonicalRoot, pluginId);
        const updateRoot = resolve(canonicalRoot, ".packages", pluginId);
        const updateName = actualDirectory.startsWith(`${updateRoot}${sep}`)
            ? actualDirectory.slice(updateRoot.length + 1)
            : undefined;
        if (
            actualDirectory !== legacyDirectory &&
            !new RegExp(`^${packageDigestHex(packageDigest)}-[a-f0-9-]{36}$`, "u").test(
                updateName ?? "",
            )
        )
            throw new Error("Installed plugin package is outside the plugin package store");
        const source = await installedSource(actualDirectory, shortName);
        const plugin = await pluginPackageLoadInstalled(actualDirectory, source, shortName);
        if (plugin.packageDigest !== packageDigest)
            throw new Error("Installed plugin package no longer matches its recorded digest");
        return plugin;
    }

    private updatePath(pluginId: string, packageDigest: string, updateId: string): string {
        this.path(pluginId);
        if (!/^[a-f0-9-]{36}$/u.test(updateId)) throw new Error("Invalid plugin update id");
        return resolve(
            this.root,
            ".packages",
            pluginId,
            `${packageDigestHex(packageDigest)}-${updateId}`,
        );
    }

    private requestPath(requestId: string): string {
        if (!/^[a-z0-9]+$/.test(requestId)) throw new Error("Invalid plugin request id");
        const destination = resolve(this.root, ".requests", requestId);
        const requestRoot = resolve(this.root, ".requests");
        if (!destination.startsWith(`${requestRoot}${sep}`))
            throw new Error("Invalid plugin request package path");
        return destination;
    }
}

async function installedSource(
    directory: string,
    shortName: string,
): Promise<PluginPackage["source"]> {
    // The source identity does not affect package validation or digest; callers have already
    // matched this directory to the durable database row.
    return { kind: "builtin", reference: shortName || directory };
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

function packageDigestHex(packageDigest: string): string {
    const match = /^sha256:([a-f0-9]{64})$/u.exec(packageDigest);
    if (!match) throw new Error("Invalid plugin package digest");
    return match[1]!;
}
