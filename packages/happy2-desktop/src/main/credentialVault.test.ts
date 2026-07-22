import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialVault, type CredentialCipher } from "./credentialVault";

const directories: string[] = [];
const cipher: CredentialCipher = {
    available: () => true,
    decrypt: (value) => Buffer.from(value.toString("utf8"), "base64").toString("utf8"),
    encrypt: (value) => Buffer.from(Buffer.from(value).toString("base64")),
};

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
});

describe("desktop credential vault", () => {
    it("round-trips target-scoped credentials without writing plaintext", async () => {
        const directory = await temporaryDirectory();
        const path = join(directory, "credentials.json");
        const vault = new CredentialVault(path, cipher);

        await vault.set("target:local", "secret-bearer");

        expect(await vault.get("target:local")).toBe("secret-bearer");
        expect(await vault.get("target:remote:abc")).toBeUndefined();
        expect(await readFile(path, "utf8")).not.toContain("secret-bearer");
        await vault.set("target:local", undefined);
        expect(await vault.get("target:local")).toBeUndefined();
    });

    it("fails closed when Keychain encryption is unavailable", async () => {
        const directory = await temporaryDirectory();
        const vault = new CredentialVault(join(directory, "credentials.json"), {
            ...cipher,
            available: () => false,
        });

        await expect(vault.set("target:local", "secret")).rejects.toThrow(
            "macOS Keychain encryption is unavailable",
        );
    });

    it("removes retired tunnel credentials without touching cloud sessions", async () => {
        const directory = await temporaryDirectory();
        const vault = new CredentialVault(join(directory, "credentials.json"), cipher);
        const topologyId = "top_0123456789abcdef0123456789abcdef";
        await vault.set(`topology:${topologyId}:tunnel:named`, "retired-tunnel-token");
        await vault.set(`target:${topologyId}`, "cloud-session-token");

        await vault.legacyTunnelCredentialsRemove();

        expect(await vault.get(`topology:${topologyId}:tunnel:named`)).toBeUndefined();
        expect(await vault.get(`target:${topologyId}`)).toBe("cloud-session-token");
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-desktop-vault-"));
    directories.push(directory);
    return directory;
}
