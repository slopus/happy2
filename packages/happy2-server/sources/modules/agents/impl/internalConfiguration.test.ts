import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    internalConfigurationMatches,
    internalConfigurationRequiresReplacement,
    internalConfigurationWrite,
} from "./internalConfiguration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("internal Rig runtime configuration", () => {
    it("writes the exact private template with the required daemon settings", async () => {
        const directory = await temporaryDirectory();

        await expect(internalConfigurationMatches(directory)).resolves.toBe(false);
        await internalConfigurationWrite(directory);

        const path = join(directory, "runtime.toml");
        expect(await readFile(path, "utf8")).toBe(
            `[settings]
durable_global_event_queue = true
happy_integration = false
`,
        );
        await expect(internalConfigurationMatches(directory)).resolves.toBe(true);
        expect((await stat(path)).mode & 0o777).toBe(0o600);
    });

    it("detects any drift from the internal template", async () => {
        const directory = await temporaryDirectory();
        await internalConfigurationWrite(directory);
        await writeFile(
            join(directory, "runtime.toml"),
            `[settings]
durable_global_event_queue = true
happy_integration = true
`,
        );

        await expect(internalConfigurationMatches(directory)).resolves.toBe(false);
    });

    it("replaces a healthy daemon when either the template hash or version differs", () => {
        expect(
            internalConfigurationRequiresReplacement({
                bundledVersion: "0.0.31",
                configurationMatches: true,
                runningVersion: "0.0.31",
            }),
        ).toBe(false);
        expect(
            internalConfigurationRequiresReplacement({
                bundledVersion: "0.0.31",
                configurationMatches: false,
                runningVersion: "0.0.31",
            }),
        ).toBe(true);
        expect(
            internalConfigurationRequiresReplacement({
                bundledVersion: "0.0.31",
                configurationMatches: true,
                runningVersion: "0.0.30",
            }),
        ).toBe(true);
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-rig-config-"));
    temporaryDirectories.push(directory);
    return directory;
}
