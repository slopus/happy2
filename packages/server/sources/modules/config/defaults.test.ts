import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { defaultConfig } from "./defaults.js";

describe("configless defaults", () => {
    it("starts a local password-authentication server", () => {
        const config = defaultConfig();
        expect(config.server.role).toBe("all");
        expect(config.database.url).toBe(`file:${join(process.cwd(), ".rigged", "rigged.db")}`);
        expect(config.agents).toMatchObject({
            directory: join(process.cwd(), ".rigged", "rig"),
            socketPath: join(process.cwd(), ".rigged", "rig", "server.sock"),
            tokenPath: join(process.cwd(), ".rigged", "rig", "token"),
            defaultCwd: join(process.cwd(), ".rigged", "workspaces"),
        });
        expect(config.agents.command).toContain("node_modules/@slopus/rig/dist/main.js");
        expect(config.auth.password).toEqual({ enabled: true, signupEnabled: true });
        expect(config.auth.magicLink.enabled).toBe(false);
        expect(config.files).toMatchObject({
            provider: "local",
            directory: join(process.cwd(), ".rigged", "files"),
            resumableChunkBytes: 8 * 1024 * 1024,
            perUserQuotaBytes: 0,
            malwareScanFailureMode: "deny",
        });
    });
});
