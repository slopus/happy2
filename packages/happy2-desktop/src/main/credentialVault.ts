import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CredentialCipher {
    available(): boolean;
    decrypt(value: Buffer): string;
    encrypt(value: string): Buffer;
}

type StoredCredentials = Readonly<Record<string, string>>;

/** Persists target-scoped bearer and tunnel credentials encrypted by macOS Keychain. */
export class CredentialVault {
    private operation = Promise.resolve();

    constructor(
        private readonly path: string,
        private readonly cipher: CredentialCipher,
    ) {}

    get(key: string): Promise<string | undefined> {
        return this.serial(async () => {
            validateKey(key);
            const encoded = (await this.read())[key];
            if (!encoded) return undefined;
            requireCipher(this.cipher);
            return this.cipher.decrypt(Buffer.from(encoded, "base64"));
        });
    }

    set(key: string, value?: string): Promise<void> {
        return this.serial(async () => {
            validateKey(key);
            if (value !== undefined && (value.length === 0 || value.length > 65_536))
                throw new Error("Credential values must contain between 1 and 65,536 characters.");
            requireCipher(this.cipher);
            const credentials = { ...(await this.read()) };
            if (value === undefined) delete credentials[key];
            else credentials[key] = this.cipher.encrypt(value).toString("base64");
            await this.write(credentials);
        });
    }

    /** Removes only credentials written by the retired named-tunnel desktop mode. */
    legacyTunnelCredentialsRemove(): Promise<void> {
        return this.serial(async () => {
            const credentials = { ...(await this.read()) };
            let changed = false;
            for (const key of Object.keys(credentials))
                if (/^topology:top_[a-f0-9]{32}:tunnel:named$/u.test(key)) {
                    delete credentials[key];
                    changed = true;
                }
            if (!changed) return;
            await this.write(credentials);
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

function validateKey(key: string): void {
    if (!/^[a-z0-9][a-z0-9:._-]{0,255}$/iu.test(key)) throw new Error("Credential key is invalid.");
}

function requireCipher(cipher: CredentialCipher): void {
    if (!cipher.available())
        throw new Error("macOS Keychain encryption is unavailable for desktop credentials.");
}
