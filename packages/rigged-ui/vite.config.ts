import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
    plugins: [solid()],
    build: {
        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            formats: ["es"],
            fileName: "index",
        },
        rollupOptions: {
            external: ["solid-js", "solid-js/web"],
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
                },
            }),
            ui: false,
            viewport: {
                height: 600,
                width: 400,
            },
        },
    },
});
