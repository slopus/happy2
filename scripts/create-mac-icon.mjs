import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const workspace = resolve(import.meta.dirname, "..");
const source = join(workspace, "packages", "happy2-desktop", "public", "app-icon.png");
const buildDirectory = join(workspace, "packages", "happy2-desktop", "build");
const destination = join(buildDirectory, "icon.icns");
const temporary = await mkdtemp(join(tmpdir(), "happy2-icon-"));
const iconset = join(temporary, "Happy2.iconset");

try {
    await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
        await resize(size, join(iconset, `icon_${size}x${size}.png`));
        await resize(size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
    }
    await execute("iconutil", [
        "--convert",
        "icns",
        "--output",
        join(temporary, "icon.icns"),
        iconset,
    ]);
    await mkdir(buildDirectory, { recursive: true });
    await rm(destination, { force: true });
    await rename(join(temporary, "icon.icns"), destination);
    console.log(`Generated ${destination}.`);
} finally {
    await rm(temporary, { force: true, recursive: true });
}

async function resize(size, output) {
    await execute("sips", ["-z", String(size), String(size), source, "--out", output]);
}
