import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

interface RigRuntimePaths {
    directory: string;
    socketPath: string;
    tokenPath: string;
}

const INTERNAL_CONFIGURATION = `[settings]
durable_global_event_queue = true
happy_integration = false
`;

const INTERNAL_CONFIGURATION_HASH = sha256(INTERNAL_CONFIGURATION);

/** Reports whether Happy (2) owns the configured Rig runtime and its daemon endpoints. */
export function internalConfigurationOwns(paths: RigRuntimePaths): boolean {
    return [paths.socketPath, paths.tokenPath].every((path) => isWithin(paths.directory, path));
}

/** Reports whether an owned, healthy daemon must be replaced before Happy (2) uses it. */
export function internalConfigurationRequiresReplacement(input: {
    bundledVersion: string;
    configurationMatches: boolean;
    runningVersion: string | undefined;
}): boolean {
    return !input.configurationMatches || input.runningVersion !== input.bundledVersion;
}

/**
 * Reports whether the private Rig runtime contains Happy (2)'s exact internal template.
 * Comparing hashes makes any drift, including unknown or manually added settings, require
 * an orderly daemon replacement before the runtime is used again.
 */
export async function internalConfigurationMatches(directory: string): Promise<boolean> {
    try {
        return (
            sha256(await readFile(configurationPath(directory), "utf8")) ===
            INTERNAL_CONFIGURATION_HASH
        );
    } catch (error) {
        if (isMissingFile(error)) return false;
        throw error;
    }
}

/** Atomically replaces the private Rig runtime configuration with the internal template. */
export async function internalConfigurationWrite(directory: string): Promise<void> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(directory, `.runtime-${randomUUID()}.toml`);
    try {
        await writeFile(temporaryPath, INTERNAL_CONFIGURATION, {
            encoding: "utf8",
            mode: 0o600,
        });
        await rename(temporaryPath, configurationPath(directory));
    } finally {
        await unlink(temporaryPath).catch(() => undefined);
    }
}

function configurationPath(directory: string): string {
    return join(directory, "runtime.toml");
}

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isWithin(directory: string, path: string): boolean {
    const descendant = relative(resolve(directory), resolve(path));
    return descendant === "" || (!descendant.startsWith("..") && !isAbsolute(descendant));
}
