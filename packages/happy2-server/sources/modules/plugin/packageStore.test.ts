import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeFileSystemContext, loadSkills } from "@slopus/rig/dist/agent/index.js";
import { describe, expect, it } from "vitest";
import { pluginPackageLoad } from "./catalog.js";
import { PluginPackageStore } from "./packageStore.js";

describe("installed plugin skills", () => {
    it("are discovered by Rig and reconcile only Happy-owned skill files", async () => {
        const temporary = await mkdtemp(join(tmpdir(), "happy2-plugin-skills-"));
        try {
            const packageRoot = join(temporary, "packages");
            const agentHome = join(temporary, "home");
            const workspace = join(temporary, "workspace");
            const userSkill = join(agentHome, ".agents", "skills", "user-skill");
            await Promise.all([
                mkdir(packageRoot, { recursive: true }),
                mkdir(userSkill, { recursive: true }),
                mkdir(workspace, { recursive: true }),
            ]);
            await writeFile(
                join(userSkill, "SKILL.md"),
                "---\nname: user-skill\ndescription: Keep this user-owned skill.\n---\n\nUser skill.\n",
            );
            const source = await pluginPackageLoad(
                join(process.cwd(), "..", "happy2-plugin-plugin-developer", "dist", "plugin"),
                "plugin-developer",
            );
            const store = new PluginPackageStore(packageRoot);
            const installed = await store.install(source, "pluginid");
            const ready = [
                {
                    pluginId: "pluginid",
                    shortName: source.manifest.shortName,
                    packageDigest: source.packageDigest,
                    packageDirectory: installed.packageDirectory,
                    source: source.source,
                },
            ];

            await store.syncSkills(ready, agentHome);
            const context = createNodeFileSystemContext(workspace, { home: agentHome });
            await expect(loadSkills(context)).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: "happy2-plugin-development" }),
                    expect.objectContaining({ name: "user-skill" }),
                ]),
            );

            await store.syncSkills([], agentHome);
            await expect(loadSkills(context)).resolves.toEqual([
                expect.objectContaining({ name: "user-skill" }),
            ]);
        } finally {
            await rm(temporary, { recursive: true, force: true });
        }
    });
});
