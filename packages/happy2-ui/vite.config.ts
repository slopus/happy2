import { resolve } from "node:path";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
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
        browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
            provider: playwright({
                contextOptions: {
                    deviceScaleFactor: 2,
                    /* Must be >= the tester viewport below: when the browser
                     * window is smaller, vitest CSS-scales the tester iframe
                     * and element captures come out at a fraction of true 2x. */
                    viewport: {
                        height: 1660,
                        width: 1660,
                    },
                },
            }),
            ui: false,
            /* Element captures clip to the viewport; keep it larger than any
             * test surface so screenshots and pixel measurements never truncate. */
            viewport: {
                height: 1600,
                width: 1600,
            },
        },
    },
});
