import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execute = promisify(execFile);
const workspace = resolve(import.meta.dirname, "..");
const source = join(workspace, "packages", "happy2-desktop", "public", "app-icon.png");
const buildDirectory = join(workspace, "packages", "happy2-desktop", "build");
const destination = join(buildDirectory, "icon.icns");
const temporary = await mkdtemp(join(tmpdir(), "happy2-icon-"));
const iconset = join(temporary, "Happy2.iconset");
const canvasSize = 1024;
const tileSize = 824;
const tileCornerRadius = 185;

try {
    await mkdir(iconset, { recursive: true });
    const macArtwork = join(temporary, "app-icon-mac.png");
    const roundedTile = Buffer.from(
        `<svg width="${tileSize}" height="${tileSize}">
            <rect width="${tileSize}" height="${tileSize}" rx="${tileCornerRadius}" fill="white"/>
        </svg>`,
    );
    const tile = await sharp(source)
        .resize(tileSize, tileSize)
        .composite([{ input: roundedTile, blend: "dest-in" }])
        .png()
        .toBuffer();

    await sharp({
        create: {
            width: canvasSize,
            height: canvasSize,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([
            {
                input: tile,
                left: (canvasSize - tileSize) / 2,
                top: (canvasSize - tileSize) / 2,
            },
        ])
        .png()
        .toFile(macArtwork);

    for (const size of [16, 32, 128, 256, 512]) {
        await resize(macArtwork, size, join(iconset, `icon_${size}x${size}.png`));
        await resize(macArtwork, size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
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

async function resize(input, size, output) {
    await execute("sips", ["-z", String(size), String(size), input, "--out", output]);
}
