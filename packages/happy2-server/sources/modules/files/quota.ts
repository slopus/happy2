import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { withFileLock } from "./lock.js";

export type QuotaScope = "user" | "server";

export class QuotaExceededError extends Error {
    constructor(
        readonly scope: QuotaScope,
        readonly limit: number,
    ) {
        super(`${scope === "user" ? "User" : "Server"} file quota exceeded`);
        this.name = "QuotaExceededError";
    }
}

export interface QuotaReservation {
    id: string;
    ownerUserId: string;
    bytes: number;
    state: "reserved" | "committed";
}

/** A distributed deployment can replace this with a transactional shared ledger. */
export interface FileQuotaPolicy {
    reserve(input: { id: string; ownerUserId: string; bytes: number }): Promise<void>;
    resizeReservation(id: string, actualBytes: number): Promise<void>;
    commit(id: string, actualBytes: number): Promise<void>;
    release(id: string): Promise<void>;
    reconcileCommitted(
        files: Iterable<{ id: string; ownerUserId: string; bytes: number }>,
    ): Promise<void>;
}

interface QuotaLedger {
    version: 1;
    entries: Record<string, QuotaReservation>;
}

export class LocalFileQuotaPolicy implements FileQuotaPolicy {
    private readonly metadataDirectory: string;
    private readonly ledgerPath: string;
    private readonly lockPath: string;
    private queue: Promise<void> = Promise.resolve();

    constructor(
        directory: string,
        private readonly limits: { perUserBytes: number; serverBytes: number },
        private readonly committedBytes: () => Promise<number>,
    ) {
        this.metadataDirectory = join(directory, ".metadata");
        this.ledgerPath = join(this.metadataDirectory, "quota.json");
        this.lockPath = join(this.metadataDirectory, "quota.lock");
    }

    async reserve(input: { id: string; ownerUserId: string; bytes: number }): Promise<void> {
        if (!Number.isSafeInteger(input.bytes) || input.bytes < 1)
            throw new Error("Quota reservation must contain a positive safe byte count");
        await this.update(async (ledger) => {
            const existing = ledger.entries[input.id];
            if (existing) {
                if (
                    existing.ownerUserId === input.ownerUserId &&
                    existing.bytes === input.bytes &&
                    existing.state === "reserved"
                )
                    return false;
                throw new Error("Quota reservation already exists");
            }
            await this.assertCapacity(ledger, input.ownerUserId, input.bytes);
            ledger.entries[input.id] = { ...input, state: "reserved" };
            return true;
        });
    }

    async resizeReservation(id: string, actualBytes: number): Promise<void> {
        validByteCount(actualBytes);
        await this.update(async (ledger) => {
            const reservation = ledger.entries[id];
            if (!reservation || reservation.state !== "reserved")
                throw new Error("Quota reservation does not exist");
            const delta = actualBytes - reservation.bytes;
            if (delta > 0) await this.assertCapacity(ledger, reservation.ownerUserId, delta);
            reservation.bytes = actualBytes;
            return true;
        });
    }

    async commit(id: string, actualBytes: number): Promise<void> {
        validByteCount(actualBytes);
        await this.update(async (ledger) => {
            const reservation = ledger.entries[id];
            if (!reservation || reservation.state !== "reserved")
                throw new Error("Quota reservation does not exist");
            const delta = actualBytes - reservation.bytes;
            if (delta > 0) await this.assertCapacity(ledger, reservation.ownerUserId, delta);
            reservation.bytes = actualBytes;
            reservation.state = "committed";
            return true;
        });
    }

    async release(id: string): Promise<void> {
        await this.update(async (ledger) => {
            if (!ledger.entries[id]) return false;
            delete ledger.entries[id];
            return true;
        });
    }

    async reconcileCommitted(
        files: Iterable<{ id: string; ownerUserId: string; bytes: number }>,
    ): Promise<void> {
        const committed = [...files];
        for (const file of committed) validByteCount(file.bytes);
        await this.update(async (ledger) => {
            const entries: Record<string, QuotaReservation> = {};
            for (const entry of Object.values(ledger.entries))
                if (entry.state === "reserved") entries[entry.id] = entry;
            for (const file of committed)
                entries[file.id] = {
                    id: file.id,
                    ownerUserId: file.ownerUserId,
                    bytes: file.bytes,
                    state: "committed",
                };
            ledger.entries = entries;
            return true;
        });
    }

    private async assertCapacity(
        ledger: QuotaLedger,
        ownerUserId: string,
        addedBytes: number,
    ): Promise<void> {
        if (this.limits.perUserBytes > 0) {
            const used = Object.values(ledger.entries)
                .filter((entry) => entry.ownerUserId === ownerUserId)
                .reduce((sum, entry) => sum + entry.bytes, 0);
            if (used + addedBytes > this.limits.perUserBytes)
                throw new QuotaExceededError("user", this.limits.perUserBytes);
        }
        if (this.limits.serverBytes > 0) {
            const reserved = Object.values(ledger.entries)
                .filter((entry) => entry.state === "reserved")
                .reduce((sum, entry) => sum + entry.bytes, 0);
            const trackedCommitted = Object.values(ledger.entries)
                .filter((entry) => entry.state === "committed")
                .reduce((sum, entry) => sum + entry.bytes, 0);
            const committed = Math.max(await this.committedBytes(), trackedCommitted);
            if (committed + reserved + addedBytes > this.limits.serverBytes)
                throw new QuotaExceededError("server", this.limits.serverBytes);
        }
    }

    private async update(operation: (ledger: QuotaLedger) => Promise<boolean>): Promise<void> {
        await this.serialized(async () => {
            await mkdir(this.metadataDirectory, { recursive: true, mode: 0o700 });
            await withFileLock(this.lockPath, async () => {
                const ledger = await this.readLedger();
                if (!(await operation(ledger))) return;
                const temporary = join(this.metadataDirectory, `.quota.${createId()}.tmp`);
                await writeFile(temporary, JSON.stringify(ledger), { mode: 0o600 });
                try {
                    await rename(temporary, this.ledgerPath);
                } finally {
                    await rm(temporary, { force: true });
                }
            });
        });
    }

    private async readLedger(): Promise<QuotaLedger> {
        try {
            const parsed = JSON.parse(await readFile(this.ledgerPath, "utf8")) as QuotaLedger;
            if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object")
                throw new Error("Unsupported quota ledger");
            for (const [id, entry] of Object.entries(parsed.entries)) {
                if (
                    entry.id !== id ||
                    typeof entry.ownerUserId !== "string" ||
                    !entry.ownerUserId ||
                    !Number.isSafeInteger(entry.bytes) ||
                    entry.bytes < 1 ||
                    (entry.state !== "reserved" && entry.state !== "committed")
                )
                    throw new Error("Corrupt quota ledger");
            }
            return parsed;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return { version: 1, entries: {} };
            throw error;
        }
    }

    private async serialized<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        } finally {
            release();
        }
    }
}

function validByteCount(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Error("Quota byte count must be a positive safe integer");
}
