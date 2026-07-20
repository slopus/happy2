import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import sharp from "sharp";

const ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface NormalizedUiAsset {
    readonly checksumSha256: string;
    readonly id: string;
    readonly path: `assets/${string}.png`;
}

/** Converts package-owned source art into Happy's exact monochrome mask contract. */
export async function normalizeUiAsset(
    packageRoot: string,
    outputRoot: string,
    id: string,
    sourcePath: string,
): Promise<NormalizedUiAsset> {
    if (!ASSET_ID.test(id)) throw new TypeError(`Invalid UI asset id ${JSON.stringify(id)}`);
    const source = await packageFile(packageRoot, sourcePath);
    const path = `assets/${id}.png` as const;
    const destination = resolve(outputRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    const { data, info } = await sharp(source)
        .ensureAlpha()
        .resize(40, 40, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .raw()
        .toBuffer({ resolveWithObject: true });
    let visible = false;
    let transparent = false;
    for (let offset = 0; offset < data.length; offset += 4) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        if (data[offset + 3] === 0) transparent = true;
        else visible = true;
    }
    if (!visible) throw new TypeError(`UI asset ${id} has no visible pixels`);
    if (!transparent)
        throw new TypeError(`UI asset ${id} must contain transparency around its artwork`);
    await sharp(data, { raw: info }).png({ palette: false }).toFile(destination);
    const built = await readFile(destination);
    const metadata = await sharp(built).metadata();
    if (
        metadata.format !== "png" ||
        metadata.width !== 40 ||
        metadata.height !== 40 ||
        !metadata.hasAlpha
    )
        throw new Error(`Failed to normalize UI asset ${id}`);
    return {
        checksumSha256: createHash("sha256").update(built).digest("hex"),
        id,
        path,
    };
}

export async function packageFile(packageRoot: string, path: string): Promise<string> {
    if (!path || path.includes("\0")) throw new TypeError("Package asset path is invalid");
    const root = await realpath(packageRoot);
    const source = await realpath(resolve(root, path));
    const nested = relative(root, source);
    if (!nested || nested.startsWith("..") || nested.includes("/../") || nested.includes("\\..\\"))
        throw new TypeError(`Package path ${JSON.stringify(path)} escapes the plugin root`);
    return source;
}
