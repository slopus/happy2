import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        emptyOutDir: false,
        lib: {
            entry: resolve(import.meta.dirname, "src/preload.ts"),
            formats: ["cjs"],
            fileName: () => "preload.cjs",
        },
        outDir: "dist",
        rollupOptions: {
            external: ["electron"],
        },
    },
});
