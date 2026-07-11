import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: resolve(import.meta.dirname, "src/main.ts"),
    emptyOutDir: false,
    outDir: "dist",
    rollupOptions: {
      external: ["electron"],
      output: {
        entryFileNames: "main.js"
      }
    }
  }
});
