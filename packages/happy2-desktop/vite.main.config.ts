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
                "server-process": resolve(import.meta.dirname, "src/serverProcess.ts"),
            },
            external: ["electron", "electron-updater", "happy2-server"],
            output: {
                entryFileNames: "[name].js",
            },
        },
    },
});
