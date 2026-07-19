import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config/defaults.js";
import { TokenService } from "./tokens.js";

describe("plugin runtime capability tokens", () => {
    it("survive service reconstruction without persisting token bytes", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const issuer = await TokenService.create(config, keys);
        const token = await issuer.issuePluginRuntimeToken({
            installationId: "plugin-installation",
            containerInstanceId: "container-incarnation",
            permissions: ["plugins:list"],
        });

        const restarted = await TokenService.create(config, keys);
        await expect(restarted.verifyPluginRuntimeToken(token)).resolves.toEqual({
            installationId: "plugin-installation",
            containerInstanceId: "container-incarnation",
            permissions: ["plugins:list"],
        });
        await expect(restarted.verify(token)).rejects.toThrow();
    });
});
