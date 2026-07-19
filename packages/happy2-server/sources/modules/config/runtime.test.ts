import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "./runtime.js";

const managedSecretNames = [
    "HAPPY2_INTEGRATION_SECRET",
    "HAPPY2_JWT_PRIVATE_KEY",
    "HAPPY2_JWT_PRIVATE_KEY_B64",
    "HAPPY2_JWT_PUBLIC_KEY",
    "HAPPY2_JWT_PUBLIC_KEY_B64",
    "HAPPY2_PASSWORD_PEPPER",
] as const;

const originalEnvironment = new Map(
    managedSecretNames.map((name) => [name, process.env[name]] as const),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
    for (const name of managedSecretNames) {
        const original = originalEnvironment.get(name);
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
    }
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { force: true, recursive: true })),
    );
});

describe.sequential("runtime configuration", () => {
    it("reads a partial managed TOML and persists generated secrets beside it", async () => {
        const cwd = await temporaryDirectory();
        const runtimeDirectory = join(cwd, ".happy2");
        const configPath = join(runtimeDirectory, "happy2.toml");
        await mkdir(runtimeDirectory, { recursive: true });
        await writeFile(
            configPath,
            `[server]
role = "all"
host = "0.0.0.0"
port = 4100
`,
        );
        clearManagedSecrets();

        const loaded = await loadRuntimeConfig(undefined, cwd);

        expect(loaded.managedConfigPath).toBe(configPath);
        expect(loaded.config.server).toMatchObject({
            role: "all",
            host: "0.0.0.0",
            port: 4100,
            publicUrl: "http://127.0.0.1:3000",
        });
        expect(loaded.config.database.url).toBe(`file:${join(runtimeDirectory, "happy2.db")}`);
        expect(loaded.config.auth.password.enabled).toBe(true);
        await expectManagedSecrets(join(runtimeDirectory, ".env"));
        await expect(stat(join(cwd, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("persists generated secrets beside an explicit partial config", async () => {
        const cwd = await temporaryDirectory();
        const configDirectory = join(cwd, "config");
        const configPath = join(configDirectory, "happy2.toml");
        await mkdir(configDirectory, { recursive: true });
        await writeFile(
            configPath,
            `[server]
host = "0.0.0.0"
`,
        );
        clearManagedSecrets();

        const loaded = await loadRuntimeConfig(configPath, cwd);

        expect(loaded.config.server.host).toBe("0.0.0.0");
        expect(loaded.config.server.port).toBe(3000);
        await expectManagedSecrets(join(configDirectory, ".env"));
        await expect(stat(join(cwd, ".happy2", ".env"))).rejects.toMatchObject({
            code: "ENOENT",
        });
    });

    it("uses all defaults and the managed secret path when no TOML exists", async () => {
        const cwd = await temporaryDirectory();
        clearManagedSecrets();

        const loaded = await loadRuntimeConfig(undefined, cwd);

        expect(loaded.config.server).toMatchObject({
            role: "all",
            host: "127.0.0.1",
            port: 3000,
        });
        await expectManagedSecrets(join(cwd, ".happy2", ".env"));
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-runtime-config-"));
    temporaryDirectories.push(directory);
    return directory;
}

function clearManagedSecrets(): void {
    for (const name of managedSecretNames) delete process.env[name];
}

async function expectManagedSecrets(path: string): Promise<void> {
    const contents = await readFile(path, "utf8");
    expect(contents).toMatch(/^HAPPY2_JWT_PRIVATE_KEY_B64=.+$/m);
    expect(contents).toMatch(/^HAPPY2_JWT_PUBLIC_KEY_B64=.+$/m);
    expect(contents).toMatch(/^HAPPY2_PASSWORD_PEPPER=.+$/m);
    expect(contents).toMatch(/^HAPPY2_INTEGRATION_SECRET=.+$/m);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
}
