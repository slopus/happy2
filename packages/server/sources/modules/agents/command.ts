import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Resolves the Rig executable installed with happy2, never a global binary. */
export function bundledRigCommand(): string {
    return require.resolve("@slopus/rig/dist/main.js");
}
