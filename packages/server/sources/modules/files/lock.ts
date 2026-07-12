import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** Cross-process mutex for the durable local provider and quota ledger. */
export async function withFileLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + 5_000;
    let handle;
    for (;;) {
        let candidate;
        try {
            candidate = await open(lockPath, "wx", 0o600);
            await candidate.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
            handle = candidate;
            break;
        } catch (error) {
            if (candidate) {
                await candidate.close();
                await rm(lockPath, { force: true });
            }
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            await recoverAbandonedLock(lockPath);
            if (Date.now() >= deadline) throw new Error("File storage is busy");
            await delay(25);
        }
    }
    try {
        return await operation();
    } finally {
        try {
            await handle.close();
        } finally {
            await rm(lockPath, { force: true });
        }
    }
}

async function recoverAbandonedLock(lockPath: string): Promise<void> {
    const recoveryPath = `${lockPath}.recovery`;
    let recovery;
    try {
        recovery = await open(recoveryPath, "wx", 0o600);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
        throw error;
    }
    try {
        let abandoned = false;
        try {
            const metadata = await readFile(lockPath, "utf8");
            const pid = Number(metadata.split("\n", 1)[0]);
            abandoned = !processIsAlive(pid);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (abandoned) await rm(lockPath, { force: true });
    } finally {
        await recovery.close();
        await rm(recoveryPath, { force: true });
    }
}

function processIsAlive(pid: number): boolean {
    if (!Number.isSafeInteger(pid) || pid < 1) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}
