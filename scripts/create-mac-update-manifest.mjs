import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const releaseDirectory = resolve(process.argv[2] ?? "packages/happy2-desktop/release");
const version = process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME?.replace(/^v/u, "");
if (!version) throw new Error("Set RELEASE_VERSION or run from a v* GitHub tag.");
const names = (await readdir(releaseDirectory))
    .filter((name) => name.endsWith(".zip") && /-(arm64|x64)\.zip$/u.test(name))
    .sort();
if (names.length !== 2)
    throw new Error(`Expected one arm64 and one x64 update zip, found: ${names.join(", ")}`);
const files = await Promise.all(
    names.map(async (name) => {
        const path = join(releaseDirectory, name);
        return {
            url: basename(path),
            sha512: createHash("sha512")
                .update(await readFile(path))
                .digest("base64"),
            size: (await stat(path)).size,
        };
    }),
);
const preferred = files.find((file) => file.url.includes("-arm64.")) ?? files[0];
const yaml = [
    `version: ${version}`,
    "files:",
    ...files.flatMap((file) => [
        `  - url: ${file.url}`,
        `    sha512: ${file.sha512}`,
        `    size: ${file.size}`,
    ]),
    `path: ${preferred.url}`,
    `sha512: ${preferred.sha512}`,
    `releaseDate: ${new Date().toISOString()}`,
    "",
].join("\n");
await writeFile(join(releaseDirectory, "latest-mac.yml"), yaml);
console.log(`Wrote ${join(releaseDirectory, "latest-mac.yml")}.`);
