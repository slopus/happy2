import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type StoredCredentials = Readonly<Record<string, string>>;

/** Removes encrypted credentials left by retired tunnel and cloud-bearer desktop designs. */
export class CredentialVault {
    private operation = Promise.resolve();

    constructor(private readonly path: string) {}

    obsoleteCredentialsRemove(): Promise<void> {
        return this.serial(async () => {
            const credentials = { ...(await this.read()) };
            let changed = false;
            for (const key of Object.keys(credentials))
                if (
                    /^topology:top_[a-f0-9]{32}:tunnel:named$/u.test(key) ||
                    /^target:top_[a-f0-9]{32}$/u.test(key)
                ) {
                    delete credentials[key];
                    changed = true;
                }
            if (changed) await this.write(credentials);
        });
    }

    private async read(): Promise<StoredCredentials> {
        try {
            const value = JSON.parse(await readFile(this.path, "utf8")) as unknown;
            if (!value || typeof value !== "object" || Array.isArray(value)) return {};
            return Object.fromEntries(
                Object.entries(value).filter(
                    (entry): entry is [string, string] => typeof entry[1] === "string",
                ),
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
            throw error;
        }
    }

    private async write(credentials: StoredCredentials): Promise<void> {
        await mkdir(dirname(this.path), { mode: 0o700, recursive: true });
        const temporary = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(credentials, undefined, 2)}\n`, {
            mode: 0o600,
        });
        await rename(temporary, this.path);
    }

    private serial<T>(work: () => Promise<T>): Promise<T> {
        const next = this.operation.then(work, work);
        this.operation = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }
}
