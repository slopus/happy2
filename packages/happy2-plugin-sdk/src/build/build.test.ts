import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ContributionDefinition } from "../types.js";
import { normalizeUiAsset } from "./assets.js";
import { buildPlugin, inlineViteHtml } from "./build.js";
import { createPluginManifest } from "./manifest.js";

describe("plugin build helpers", () => {
    it("creates the installable stdio manifest", () => {
        expect(
            createPluginManifest(
                {
                    description: "Collaborative tasks",
                    displayName: "Tasks",
                    permissions: ["apps:manage"],
                    shortName: "todos",
                    version: "1.2.3",
                },
                [{ id: "todo", path: "assets/todo.png" }],
            ),
        ).toMatchObject({
            schemaVersion: 1,
            uiAssets: [{ id: "todo", path: "assets/todo.png" }],
            mcp: { command: "node", args: ["/plugin/server.js"], type: "stdio" },
        });
    });

    it("inlines Vite scripts and styles", async () => {
        const html = await inlineViteHtml(
            '<link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script>',
            async (path) =>
                path.endsWith(".css")
                    ? "body{color:red}"
                    : 'globalThis.template="<script src=\\"inside-a-string.js\\"></script>"',
        );
        expect(html).toBe(
            '<style>body{color:red}</style><script type="module">globalThis.template="<script src=\\"inside-a-string.js\\"><\\/script>"</script>',
        );
    });

    it("normalizes source art to a transparent 40px black RGBA mask", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-sdk-"));
        const source = join(root, "source.png");
        await sharp({
            create: {
                width: 20,
                height: 10,
                channels: 4,
                background: { r: 220, g: 80, b: 40, alpha: 1 },
            },
        })
            .png()
            .toFile(source);
        const output = join(root, "dist/plugin");
        const result = await normalizeUiAsset(root, output, "create-task", "source.png");
        const image = sharp(await readFile(join(output, result.path)));
        const { data, info } = await image
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        expect(info).toMatchObject({ width: 40, height: 40, channels: 4 });
        for (let offset = 0; offset < data.length; offset += 4)
            if (data[offset + 3]) expect([...data.subarray(offset, offset + 3)]).toEqual([0, 0, 0]);
    });

    it("copies a conventional skills directory without package-specific scripts", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-sdk-skills-"));
        await mkdir(join(root, "src"), { recursive: true });
        await mkdir(join(root, "skills/example"), { recursive: true });
        await writeFile(join(root, "src/server.ts"), "export const ready = true;\n", "utf8");
        await writeFile(join(root, "src/label.ts"), 'export const label = "Built app";\n', "utf8");
        await writeFile(
            join(root, "src/app.ts"),
            'import { label } from "./label.js"; document.body.dataset.label = label;\n',
            "utf8",
        );
        await writeFile(
            join(root, "skills/example/SKILL.md"),
            "---\nname: example\ndescription: Example skill\n---\n",
            "utf8",
        );
        const result = await buildPlugin({
            root,
            apps: { example: "src/app.ts" },
            manifest: {
                description: "Tests configless skill packaging.",
                displayName: "Skills",
                shortName: "skills",
                version: "1.0.0",
            },
        });
        await expect(
            readFile(join(result.outputDirectory, "skills/example/SKILL.md"), "utf8"),
        ).resolves.toContain("name: example");
        const app = await readFile(join(result.outputDirectory, "apps/example.html"), "utf8");
        expect(app).toContain("Built app");
        expect(app).not.toMatch(/<script\b[^>]*\bsrc=/);
    });

    it("keeps contribution placements and control kinds closed at compile time", () => {
        const contribution = {
            audience: { scope: "all_users" },
            description: "Open tasks",
            externalKey: "tasks",
            location: "composerIcon",
            position: 0,
            spec: {
                action: { toolName: "open_tasks" },
                assetId: "todo",
                description: "Open tasks",
                id: "open",
                kind: "button",
                title: "Tasks",
            },
            title: "Tasks",
        } satisfies ContributionDefinition;
        expect(contribution.location).toBe("composerIcon");
    });
});
