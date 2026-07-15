import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/playwright/**/*.test.ts"],
        browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
            provider: playwright({
                contextOptions: {
                    deviceScaleFactor: 2,
                    viewport: {
                        height: 900,
                        width: 900,
                    },
                },
            }),
            ui: false,
            viewport: {
                height: 800,
                width: 800,
            },
        },
    },
});
