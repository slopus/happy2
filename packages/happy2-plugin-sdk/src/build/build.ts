import {
    cp,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    realpath,
    rm,
    writeFile,
} from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import sharp from "sharp";
import { build as viteBuild, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import type { BuiltPluginManifest, UiAssetDeclaration } from "../types.js";
import { normalizeUiAsset, packageFile } from "./assets.js";
import type { PluginBuildConfig } from "./config.js";
import { createPluginManifest } from "./manifest.js";

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAILWIND_STYLESHEET = fileURLToPath(import.meta.resolve("tailwindcss/index.css"));
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const DEFAULT_DOCKERFILE = `FROM node:24-alpine

WORKDIR /plugin
COPY . /plugin/

CMD ["sleep", "infinity"]
`;

export interface PluginBuildResult {
    readonly appFiles: Readonly<Record<string, string>>;
    readonly manifest: BuiltPluginManifest;
    readonly outputDirectory: string;
}

/** Builds a TypeScript/React plugin package into its installable `dist/plugin` artifact. */
export async function buildPlugin(config: PluginBuildConfig): Promise<PluginBuildResult> {
    // Canonicalize once so packageFile() and temporary HTML entries share the
    // same path namespace on platforms where /var aliases /private/var.
    const root = await realpath(resolve(config.root ?? process.cwd()));
    const outputDirectory = resolve(root, config.outDir ?? "dist/plugin");
    assertNestedOutput(root, outputDirectory);
    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    const server = await packageFile(root, config.server ?? "src/server.ts");
    await bundleServer(root, server, outputDirectory, config.serverMinify ?? false);
    const appFiles = await buildApps(root, outputDirectory, config.apps ?? {});
    const declarations: UiAssetDeclaration[] = [];
    for (const [id, source] of Object.entries(config.uiAssets ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        const normalized = await normalizeUiAsset(root, outputDirectory, id, source);
        declarations.push({ id: normalized.id, path: normalized.path });
    }

    const icon = config.pluginIcon ?? "plugin.png";
    const iconSource = await packageFile(root, icon).catch((error: unknown) => {
        if (config.pluginIcon) throw error;
        return undefined;
    });
    if (iconSource) {
        await validatePluginIcon(iconSource);
        await cp(iconSource, resolve(outputDirectory, "plugin.png"));
    }

    await copyOptionalSkills(root, outputDirectory);

    const manifest = createPluginManifest(config.manifest, declarations);
    await mkdir(resolve(outputDirectory, "container"), { recursive: true });
    await writeFile(resolve(outputDirectory, "container/Dockerfile"), DEFAULT_DOCKERFILE, "utf8");
    await writeFile(
        resolve(outputDirectory, "package.json"),
        `${JSON.stringify({ type: "module" }, null, 4)}\n`,
        "utf8",
    );
    await writeFile(
        resolve(outputDirectory, "plugin.json"),
        `${JSON.stringify(manifest, null, 4)}\n`,
        "utf8",
    );
    return { appFiles, manifest, outputDirectory };
}

async function bundleServer(
    root: string,
    entry: string,
    output: string,
    minify: boolean,
): Promise<void> {
    await viteBuild({
        build: {
            emptyOutDir: false,
            lib: { entry, formats: ["es"] },
            minify,
            outDir: output,
            rollupOptions: {
                external: (id) => NODE_BUILTINS.has(id),
                output: {
                    banner: 'import { createRequire as __happy2CreateRequire } from "node:module"; const require = __happy2CreateRequire(import.meta.url);',
                    entryFileNames: "server.js",
                },
            },
            sourcemap: false,
            ssr: true,
            target: "node24",
        },
        configFile: false,
        // A packaged plugin does not carry dependency-owned worker files, so optional
        // workers addressed through relative require.resolve paths cannot exist.
        // jsdom only uses this for synchronous XHR, which plugin servers do not expose.
        define: { "require.resolve": "undefined" },
        logLevel: "warn",
        root,
        ssr: { noExternal: true },
    });
    await lstat(resolve(output, "server.js")).catch((error: unknown) => {
        throw new Error("Plugin server build did not emit server.js", { cause: error });
    });
}

async function buildApps(
    root: string,
    output: string,
    apps: NonNullable<PluginBuildConfig["apps"]>,
): Promise<Readonly<Record<string, string>>> {
    const result: Record<string, string> = {};
    // Keep the temporary HTML entry under the plugin root. Vite resolves HTML
    // module URLs as browser paths, so a temp directory in the system tmp tree
    // would encode an absolute package entry as a broken ../../.../Users URL.
    // A nested temp directory gives Vite an ordinary in-root relative import
    // while still being removed atomically after the build.
    const temporaryRoot = await mkdtemp(join(root, ".happy2-plugin-build-"));
    try {
        for (const [name, raw] of Object.entries(apps).sort(([a], [b]) => a.localeCompare(b))) {
            if (!SAFE_NAME.test(name))
                throw new TypeError(`Invalid app name ${JSON.stringify(name)}`);
            const entry = await packageFile(root, typeof raw === "string" ? raw : raw.entry);
            const appTemporary = resolve(temporaryRoot, name);
            const htmlEntry = resolve(appTemporary, "index.html");
            const stylesheetEntry = resolve(appTemporary, "styles.css");
            const appOutput = resolve(appTemporary, "output");
            await mkdir(appTemporary, { recursive: true });
            const source = relative(dirname(htmlEntry), entry).split(sep).join("/");
            const pluginSource = relative(dirname(stylesheetEntry), root).split(sep).join("/");
            await writeFile(
                stylesheetEntry,
                `@import "tailwindcss" source(${JSON.stringify(pluginSource)});\n`,
                "utf8",
            );
            await writeFile(
                htmlEntry,
                `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./styles.css"></head><body><div id="root"></div><script type="module" src="${source.startsWith(".") ? source : `./${source}`}"></script></body></html>`,
                "utf8",
            );
            await viteBuild({
                base: "./",
                build: {
                    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
                    // MCP Apps are intentionally emitted as one portable HTML
                    // resource, so Vite's code-splitting size warning is not an
                    // actionable recommendation for this build mode.
                    chunkSizeWarningLimit: 10_000,
                    cssCodeSplit: false,
                    emptyOutDir: true,
                    minify: true,
                    outDir: appOutput,
                    rollupOptions: { input: htmlEntry },
                    sourcemap: false,
                    target: "es2022",
                },
                configFile: false,
                logLevel: "warn",
                plugins: [react(), tailwindcss(), htmlSafeInlineCss(), viteSingleFile()],
                resolve: {
                    // Plugin packages consume Tailwind through the SDK and do
                    // not need to install or configure it themselves.
                    alias: [{ find: /^tailwindcss$/, replacement: TAILWIND_STYLESHEET }],
                },
                root: appTemporary,
            });
            const emitted = await readdir(appOutput);
            if (emitted.length !== 1 || emitted[0] !== "index.html")
                throw new Error(
                    `Single-file app build emitted unexpected files: ${emitted.sort().join(", ")}`,
                );
            const singleFile = await readFile(resolve(appOutput, "index.html"), "utf8");
            const destination = resolve(output, "apps", `${name}.html`);
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, singleFile, "utf8");
            result[name] = `apps/${name}.html`;
        }
    } finally {
        await rm(temporaryRoot, { force: true, recursive: true });
    }
    return result;
}

function htmlSafeInlineCss(): Plugin {
    return {
        enforce: "post",
        name: "happy2:html-safe-inline-css",
        generateBundle(_options, bundle) {
            // The single-file plugin protects inline script end tags. Apply the
            // equivalent HTML raw-text protection to CSS before it is inlined.
            for (const output of Object.values(bundle)) {
                if (output.type !== "asset" || !output.fileName.endsWith(".css")) continue;
                const css =
                    typeof output.source === "string"
                        ? output.source
                        : new TextDecoder().decode(output.source);
                output.source = css.replace(/<\/style/gi, () => "<\\/style");
            }
        },
    };
}

function assertNestedOutput(root: string, output: string): void {
    const nested = relative(root, output);
    if (!nested || nested.startsWith("..") || nested.split(sep).includes(".."))
        throw new TypeError("Plugin build output must be nested inside the package root");
}

async function validatePluginIcon(path: string): Promise<void> {
    const metadata = await sharp(path).metadata();
    if (metadata.format !== "png" || !metadata.width || metadata.width !== metadata.height)
        throw new TypeError("plugin.png must be a square PNG image");
}

async function copyOptionalSkills(root: string, output: string): Promise<void> {
    const source = resolve(root, "skills");
    const metadata = await lstat(source).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
    });
    if (!metadata) return;
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new TypeError("Plugin skills must be a real directory");
    await cp(source, resolve(output, "skills"), {
        recursive: true,
        errorOnExist: true,
        force: false,
    });
}
