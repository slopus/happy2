import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    desktopSettingsActivate,
    desktopSettingsRead,
    desktopSettingsWrite,
} from "./desktopSettings";

const directories: string[] = [];
const local = { id: "top_0123456789abcdef0123456789abcdef", mode: "local" } as const;
const cloud = {
    id: "top_fedcba9876543210fedcba9876543210",
    mode: "cloud",
    serverUrl: "https://happy.example.test",
} as const;

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
});

describe("desktop topology settings", () => {
    it("round-trips multiple topologies and preserves them while changing the active one", async () => {
        const path = await settingsPath();
        const first = desktopSettingsActivate(undefined, local);
        const second = desktopSettingsActivate(first, cloud);
        await desktopSettingsWrite(path, second);

        await expect(desktopSettingsRead(path)).resolves.toEqual({
            version: 2,
            activeTopologyId: cloud.id,
            topologies: [local, cloud],
        });
        const activated = desktopSettingsActivate((await desktopSettingsRead(path))!, local);
        await desktopSettingsWrite(path, activated);
        await expect(desktopSettingsRead(path)).resolves.toEqual({
            version: 2,
            activeTopologyId: local.id,
            topologies: [local, cloud],
        });
    });

    it("normalizes cloud origins before writing", async () => {
        const path = await settingsPath();
        const settings = desktopSettingsActivate(undefined, {
            ...cloud,
            serverUrl: "https://HAPPY.example.test/",
        });
        await desktopSettingsWrite(path, settings);
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
            version: 2,
            activeTopologyId: cloud.id,
            topologies: [cloud],
        });
    });

    it("rejects malformed inactive records, duplicate IDs, and missing active IDs", async () => {
        const path = await settingsPath();
        for (const value of [
            {
                version: 2,
                activeTopologyId: local.id,
                topologies: [local, { id: cloud.id, mode: "cloud", serverUrl: "http://unsafe" }],
            },
            { version: 2, activeTopologyId: local.id, topologies: [local, local] },
            { version: 2, activeTopologyId: cloud.id, topologies: [local] },
        ]) {
            await writeFile(path, JSON.stringify(value), { mode: 0o600 });
            await expect(desktopSettingsRead(path)).resolves.toBeUndefined();
        }
    });

    it("migrates a version-one local topology in place without using its old Rig choice", async () => {
        const path = await settingsPath();
        await writeFile(
            path,
            JSON.stringify({
                version: 1,
                activeTopologyId: local.id,
                topologies: [{ ...local, rig: "embedded" }],
            }),
            { mode: 0o600 },
        );
        await expect(desktopSettingsRead(path)).resolves.toEqual({
            version: 2,
            activeTopologyId: local.id,
            topologies: [local],
        });
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
            version: 2,
            activeTopologyId: local.id,
            topologies: [local],
        });
    });

    it("archives version-one hybrid settings instead of mixing their local and cloud halves", async () => {
        const path = await settingsPath();
        const source = JSON.stringify({
            version: 1,
            activeTopologyId: local.id,
            topologies: [
                {
                    id: local.id,
                    mode: "hybrid",
                    remoteUrl: cloud.serverUrl,
                    rig: "global",
                },
            ],
        });
        await writeFile(path, source, { mode: 0o600 });

        await expect(desktopSettingsRead(path)).resolves.toBeUndefined();
        await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
        await expect(readFile(path.replace(/\.json$/u, ".v1.json"), "utf8")).resolves.toBe(source);
    });

    it("returns to topology selection when settings JSON is corrupt", async () => {
        const path = await settingsPath();
        await writeFile(path, "{not-json", { mode: 0o600 });
        await expect(desktopSettingsRead(path)).resolves.toBeUndefined();
    });
});

async function settingsPath(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-desktop-settings-"));
    directories.push(directory);
    return join(directory, "desktop-settings.json");
}
