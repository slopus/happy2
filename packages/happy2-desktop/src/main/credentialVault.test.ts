import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialVault } from "./credentialVault";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
});

describe("desktop credential cleanup", () => {
    it("purges retired tunnel and cloud bearer credentials while preserving unknown data", async () => {
        const directory = await temporaryDirectory();
        const path = join(directory, "credentials.json");
        const topologyId = "top_0123456789abcdef0123456789abcdef";
        await writeFile(
            path,
            `${JSON.stringify({
                [`topology:${topologyId}:tunnel:named`]: "retired-tunnel-token",
                [`target:${topologyId}`]: "retired-cloud-token",
                unrelated: "preserved",
            })}\n`,
        );
        const vault = new CredentialVault(path);

        await vault.obsoleteCredentialsRemove();

        expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ unrelated: "preserved" });
    });

    it("does not create a credential file when there is nothing to remove", async () => {
        const directory = await temporaryDirectory();
        const path = join(directory, "credentials.json");

        await new CredentialVault(path).obsoleteCredentialsRemove();

        await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-desktop-vault-"));
    directories.push(directory);
    return directory;
}
