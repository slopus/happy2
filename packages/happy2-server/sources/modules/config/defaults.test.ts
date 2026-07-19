import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { defaultConfig } from "./defaults.js";

describe("configless defaults", () => {
    it("starts a local password-authentication server", () => {
        const config = defaultConfig();
        expect(config.server.role).toBe("all");
        expect(config.database.url).toBe(`file:${join(process.cwd(), ".happy2", "happy2.db")}`);
        expect(config.agents).toMatchObject({
            directory: join(process.cwd(), ".happy2", "rig"),
            socketPath: join(process.cwd(), ".happy2", "rig", "server.sock"),
            tokenPath: join(process.cwd(), ".happy2", "rig", "token"),
            defaultCwd: join(process.cwd(), ".happy2", "workspaces"),
        });
        expect(config.agents.command).toContain("node_modules/@slopus/rig/dist/main.js");
        expect(config.auth.password).toEqual({ enabled: true });
        expect(config.auth.magicLink.enabled).toBe(false);
        expect(config.auth.devTokens.enabled).toBe(false);
        expect(config.files).toMatchObject({
            provider: "local",
            directory: join(process.cwd(), ".happy2", "files"),
            resumableChunkBytes: 8 * 1024 * 1024,
            perUserQuotaBytes: 0,
            malwareScanFailureMode: "deny",
        });
    });
});
