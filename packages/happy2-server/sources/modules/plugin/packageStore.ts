import { randomUUID } from "node:crypto";
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
import { join, resolve, sep } from "node:path";
import { pluginPackageLoadInstalled, pluginPackageLoadSource } from "./catalog.js";
import type { PluginPackage } from "./types.js";

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

    async remove(pluginId: string): Promise<void> {
        await rm(this.path(pluginId), { force: true, recursive: true });
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
                        entry.name.startsWith(".build-"),
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
        const [canonicalRoot, storedDirectory, actualDirectory] = await Promise.all([
            realpath(this.root),
            realpath(this.path(pluginId)),
            realpath(recordedDirectory),
        ]);
        const expectedDirectory = resolve(canonicalRoot, pluginId);
        if (storedDirectory !== expectedDirectory || actualDirectory !== expectedDirectory)
            throw new Error("Installed plugin package is outside the plugin package store");
        const source = await installedSource(actualDirectory, shortName);
        const plugin = await pluginPackageLoadInstalled(actualDirectory, source, shortName);
        if (plugin.packageDigest !== packageDigest)
            throw new Error("Installed plugin package no longer matches its recorded digest");
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
        return readFile(join(this.path(pluginId), "plugin.png"));
    }

    private path(pluginId: string): string {
        if (!/^[a-z0-9]+$/.test(pluginId)) throw new Error("Invalid system plugin id");
        const destination = resolve(this.root, pluginId);
        const root = resolve(this.root);
        if (!destination.startsWith(`${root}${sep}`))
            throw new Error("Invalid plugin package path");
        return join(root, pluginId);
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
