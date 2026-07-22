import { chmod, lstat, mkdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/** Prepares a managed Rig directory only below an existing protected filesystem ancestor. */
export async function managedPrivateDirectoryPrepare(directory: string): Promise<void> {
    const absolute = resolve(directory);
    await managedDirectoryCreateWithoutRedirect(absolute);
    await managedPathSymlinksValidate(absolute);
    const canonical = await realpath(absolute);
    const metadata = await lstat(canonical);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error(`Managed Rig path is not a private directory: ${directory}`);
    const userId = process.getuid?.();
    if (userId !== undefined && metadata.uid !== userId)
        throw new Error(`Managed Rig directory is owned by another user: ${directory}`);
    if ((metadata.mode & 0o077) !== 0) await chmod(canonical, 0o700);
    await managedPathChainValidate(dirname(canonical), userId);
}

async function managedDirectoryCreateWithoutRedirect(path: string): Promise<void> {
    const userId = process.getuid?.();
    const missing: string[] = [];
    let current = path;
    while (true) {
        try {
            const metadata = await lstat(current);
            if (metadata.isSymbolicLink() && metadata.uid !== 0)
                throw new Error(`Managed Rig path contains an untrusted symbolic link: ${current}`);
            await managedPathSymlinksValidate(current);
            await managedPathChainValidate(await realpath(current), userId);
            break;
        } catch (error) {
            if (!missingPath(error)) throw error;
            missing.unshift(basename(current));
        }
        const parent = dirname(current);
        if (parent === current)
            throw new Error(`Managed Rig path has no existing protected ancestor: ${path}`);
        current = parent;
    }

    for (const segment of missing) {
        current = join(current, segment);
        try {
            await mkdir(current, { mode: 0o700 });
        } catch (error) {
            if (!pathExists(error)) throw error;
        }
        const metadata = await lstat(current);
        if (!metadata.isDirectory() || metadata.isSymbolicLink())
            throw new Error(`Managed Rig path was redirected while being created: ${current}`);
        if (userId !== undefined && metadata.uid !== userId)
            throw new Error(`Managed Rig path was claimed by another user: ${current}`);
        if ((metadata.mode & 0o077) !== 0) await chmod(current, 0o700);
    }
}

async function managedPathSymlinksValidate(path: string): Promise<void> {
    let current = path;
    while (true) {
        const metadata = await lstat(current);
        if (metadata.isSymbolicLink() && metadata.uid !== 0)
            throw new Error(`Managed Rig path contains an untrusted symbolic link: ${current}`);
        const parent = dirname(current);
        if (parent === current) return;
        current = parent;
    }
}

async function managedPathChainValidate(path: string, userId: number | undefined): Promise<void> {
    let current = path;
    while (true) {
        const metadata = await lstat(current);
        if (!metadata.isDirectory() || metadata.isSymbolicLink())
            throw new Error(`Managed Rig path has an unsafe ancestor: ${current}`);
        if (userId !== undefined && metadata.uid !== userId && metadata.uid !== 0)
            throw new Error(`Managed Rig path has an ancestor owned by another user: ${current}`);
        const writableByOthers = (metadata.mode & 0o022) !== 0;
        const sticky = (metadata.mode & 0o1000) !== 0;
        if (writableByOthers && !sticky)
            throw new Error(`Managed Rig path has an unprotected writable ancestor: ${current}`);
        const parent = dirname(current);
        if (parent === current) return;
        current = parent;
    }
}

function missingPath(error: unknown): boolean {
    return errorCodeIs(error, "ENOENT");
}

function pathExists(error: unknown): boolean {
    return errorCodeIs(error, "EEXIST");
}

function errorCodeIs(error: unknown, code: string): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
