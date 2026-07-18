import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AesGcmPluginSecretProtector } from "./secrets.js";

describe("AesGcmPluginSecretProtector", () => {
    it("binds ciphertext to its installation and variable key", async () => {
        const protector = new AesGcmPluginSecretProtector(randomBytes(32));
        const context = { installationId: "cplugin", key: "API_TOKEN" };
        const encrypted = await protector.protect("secret-value", context);

        await expect(protector.reveal(encrypted, context)).resolves.toBe("secret-value");
        await expect(
            protector.reveal(encrypted, { ...context, key: "OTHER_TOKEN" }),
        ).rejects.toThrow("could not be authenticated");
        expect(encrypted).not.toContain("secret-value");
    });
});
