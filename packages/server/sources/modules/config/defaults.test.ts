import { describe, expect, it } from "vitest";
import { defaultConfig } from "./defaults.js";

describe("configless defaults", () => {
    it("starts a local password-authentication server", () => {
        const config = defaultConfig();
        expect(config.server.role).toBe("all");
        expect(config.database.url).toBe("file:rigged.db");
        expect(config.auth.password).toEqual({ enabled: true, signupEnabled: true });
        expect(config.auth.magicLink.enabled).toBe(false);
        expect(config.files).toMatchObject({
            provider: "local",
            resumableChunkBytes: 8 * 1024 * 1024,
            perUserQuotaBytes: 0,
            malwareScanFailureMode: "deny",
        });
    });
});
