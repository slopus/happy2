import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pluginPackageLoad } from "./catalog.js";
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
            const copied = await pluginPackageLoad(staging, plugin.source.reference);
            if (copied.packageDigest !== plugin.packageDigest)
                throw new Error("Plugin package changed while its system snapshot was copied");
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
        const plugin = await pluginPackageLoad(actualDirectory, shortName);
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

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}
