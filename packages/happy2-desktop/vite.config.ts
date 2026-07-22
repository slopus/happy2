import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    plugins: [
        // The Rig terminal protocol (@slopus/ghostty-web) decodes compressed wire
        // frames with node:zlib and node Buffer; these polyfills make them real in
        // the browser instead of empty externals that would throw at runtime.
        nodePolyfills({
            include: ["buffer", "zlib", "crypto", "stream", "util"],
            globals: { Buffer: true },
        }),
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
    ],
    build: {
        outDir: "dist/renderer",
    },
});
