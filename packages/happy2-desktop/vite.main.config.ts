import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        ssr: true,
        emptyOutDir: false,
        outDir: "dist",
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, "src/main.ts"),
            },
            external: [
                /^@slopus\/rig(?:\/|$)/u,
                "@lydell/node-pty",
                "@slopus/ghostty-web",
                "electron",
                "electron-updater",
                "happy2-state",
            ],
            output: {
                entryFileNames: "[name].js",
            },
        },
    },
});
