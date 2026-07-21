import { randomUUID } from "node:crypto";
import { access, cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pluginCatalogLoad, pluginPackageLoad } from "../../sources/modules/plugin/catalog.js";

export interface BuiltinPluginOutput {
    packageName: string;
    shortName: string;
    directory: string;
}

const workspaceRoot = resolve(import.meta.dirname, "../../../..");

const builtinPluginPackagePrefix = "happy2-plugin-";
const builtinPluginSourceFilename = "happy2.plugin.ts";

export const assembledPluginCatalogDirectory = resolve(
    workspaceRoot,
    "packages/happy2-server/dist/plugins",
);

/** Discovers every trusted built-in plugin workspace from its package name and source manifest. */
export async function builtinPluginOutputsLoad(
    packagesDirectory = resolve(workspaceRoot, "packages"),
): Promise<readonly BuiltinPluginOutput[]> {
    const entries = await readdir(packagesDirectory, { withFileTypes: true });
    const packageNames = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(builtinPluginPackagePrefix))
        .map((entry) => entry.name)
        .sort();
    const outputs: BuiltinPluginOutput[] = [];

    for (const packageName of packageNames) {
        try {
            await access(join(packagesDirectory, packageName, builtinPluginSourceFilename));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw error;
        }
        outputs.push(
            builtin(
                packageName,
                packageName.slice(builtinPluginPackagePrefix.length),
                packagesDirectory,
            ),
        );
    }

    return outputs;
}

/** Validates and atomically assembles built plugin outputs into one server catalog. */
export async function assembleBuiltinPluginCatalog(
    targetDirectory: string,
    outputs: readonly BuiltinPluginOutput[],
): Promise<void> {
    assertUniqueOutputs(outputs);
    const parent = dirname(targetDirectory);
    const targetName = basename(targetDirectory);
    const nonce = randomUUID();
    const staging = join(parent, `.${targetName}.staging-${nonce}`);
    const backup = join(parent, `.${targetName}.backup-${nonce}`);
    await mkdir(parent, { recursive: true });
    await mkdir(staging);

    try {
        for (const output of outputs) {
            await pluginPackageLoad(output.directory, output.shortName);
            await cp(output.directory, join(staging, output.shortName), {
                recursive: true,
                force: false,
                errorOnExist: true,
            });
        }
        await pluginCatalogLoad(staging);
        const replaced = await moveIfPresent(targetDirectory, backup);
        try {
            await rename(staging, targetDirectory);
        } catch (error) {
            if (replaced) await rename(backup, targetDirectory);
            throw error;
        }
        if (replaced) await rm(backup, { force: true, recursive: true });
    } catch (error) {
        await rm(staging, { force: true, recursive: true });
        throw error;
    }
}

function builtin(
    packageName: string,
    shortName: string,
    packagesDirectory: string,
): BuiltinPluginOutput {
    return {
        packageName,
        shortName,
        directory: resolve(packagesDirectory, packageName, "dist/plugin"),
    };
}

function assertUniqueOutputs(outputs: readonly BuiltinPluginOutput[]): void {
    const packageNames = new Set<string>();
    const shortNames = new Set<string>();
    for (const output of outputs) {
        if (packageNames.has(output.packageName))
            throw new Error(`Duplicate built-in plugin package ${output.packageName}`);
        if (shortNames.has(output.shortName))
            throw new Error(`Duplicate built-in plugin shortName ${output.shortName}`);
        packageNames.add(output.packageName);
        shortNames.add(output.shortName);
    }
}

async function moveIfPresent(source: string, destination: string): Promise<boolean> {
    try {
        await rename(source, destination);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}
