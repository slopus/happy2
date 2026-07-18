import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
    build: {
        outDir: "dist/renderer",
    },
});
