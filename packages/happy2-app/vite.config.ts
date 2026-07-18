import { resolve } from "node:path";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
    build: {
        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            formats: ["es"],
            fileName: "index",
        },
        rollupOptions: {
            external: ["react", "react-dom", "react/jsx-runtime"],
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: [resolve(import.meta.dirname, "src/testing/setup.ts")],
    },
});
