import { readFileSync } from "node:fs";

import type { PackageManifest } from "./PackageManifest.js";

export function readPackageManifest(): PackageManifest {
    return JSON.parse(
        readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as PackageManifest;
}
