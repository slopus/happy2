import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ContributionDefinition } from "../types.js";
import { normalizeUiAsset } from "./assets.js";
import { buildPlugin } from "./build.js";
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

    it("builds a self-contained app without plugin build dependencies", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-sdk-skills-"));
        await mkdir(join(root, "src"), { recursive: true });
        await mkdir(join(root, "skills/example"), { recursive: true });
        await writeFile(join(root, "package.json"), '{"type":"module"}\n', "utf8");
        await writeFile(join(root, "src/server.ts"), "export const ready = true;\n", "utf8");
        await writeFile(join(root, "src/label.ts"), 'export const label = "Built app";\n', "utf8");
        await writeFile(
            join(root, "src/app.css"),
            'body::after { content: "$& </style>"; }\n',
            "utf8",
        );
        await writeFile(
            join(root, "src/app.ts"),
            'import "./app.css"; import { label } from "./label.js"; document.body.dataset.label = label; document.body.dataset.template = "$& </script><script src=\\"inside-a-string.js\\"></script>"; document.getElementById("root").className = "flex rounded-xl p-4";\n',
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
        expect(app).toContain("$&");
        expect(app).toContain(".flex{display:flex}");
        expect(app).toContain(".rounded-xl");
        expect(app).not.toMatch(/<link\b(?=[^>]*\brel="stylesheet")/);
        expect(app.match(/<\/script>/g)).toHaveLength(1);
        expect(app.match(/<\/style>/g)).toHaveLength(1);
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
